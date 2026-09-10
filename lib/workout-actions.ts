"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireSessionUserId } from "./auth-session";
import { reportFailure } from "./log";
import {
  addSet,
  addSetInputSchema,
  finishWorkout,
  finishWorkoutInputSchema,
  listWorkouts,
  logSet,
  logSetInputSchema,
  removeSet,
  setIdSchema,
  startWorkout,
  uncompleteSet,
  type WorkoutPage,
} from "./workouts";

export type LogSetState = { error?: string };

function message(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  if (e.message === "not_authorized") return "You don't have permission to do that.";
  if (e.message === "not_active") return "This workout is already finished.";
  if (e.message === "already_finished") return "This workout is already finished.";
  return fallback;
}

/**
 * Builds the workout revalidation path from a form, accepting the id only when
 * it is a well-formed uuid.
 *
 * This value is attacker-controlled and exists solely as a cache key — the
 * mutation itself is authorized on the set/exercise id, never on this field.
 * It is validated anyway so an untrusted string is never interpolated into a
 * path, and so the field cannot quietly become trusted after a later refactor.
 */
function workoutPathFromForm(formData: FormData): string | null {
  const parsed = finishWorkoutInputSchema.safeParse({
    workoutId: String(formData.get("workoutId") ?? ""),
  });
  return parsed.success ? `/workouts/${parsed.data.workoutId}` : null;
}

/**
 * Outcomes that are normal traffic rather than incidents: an ownership check, a
 * stale page, a workout that was already finished. Reporting these would bury
 * the failures that actually matter.
 */
const EXPECTED_FAILURES = [
  "not_authorized",
  "not_found",
  "not_active",
  "already_finished",
] as const;

/**
 * Records an unexpected server-action failure, which previously vanished.
 * Delegates to the shared reporter so all action modules classify failures the
 * same way; the module's expected-failure set is bound here.
 */
function reportActionFailure(action: string, error: unknown): void {
  reportFailure(action, error, EXPECTED_FAILURES);
}

export async function startWorkoutFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const routineId = String(formData.get("routineId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(routineId)) return;

  let id: string;
  try {
    ({ id } = await startWorkout(db, userId, routineId));
  } catch (error) {
    reportActionFailure("startWorkout", error);
    return;
  }
  revalidatePath("/workouts");
  redirect(`/workouts/${id}`);
}

export async function logSetFormAction(
  _prevState: LogSetState | null,
  formData: FormData,
): Promise<LogSetState> {
  const userId = await requireSessionUserId();
  const workoutPath = workoutPathFromForm(formData);
  const repsRaw = formData.get("reps");
  const parsed = logSetInputSchema.safeParse({
    setId: String(formData.get("setId") ?? ""),
    reps: repsRaw === null || repsRaw === "" ? null : Number(repsRaw),
    weight_kg: String(formData.get("weight_kg") ?? "").trim() || null,
    rpe: String(formData.get("rpe") ?? "").trim() || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid set." };
  }
  try {
    await logSet(db, userId, parsed.data);
  } catch (e) {
    reportActionFailure("logSet", e);
    return { error: message(e, "Could not save this set.") };
  }
  if (workoutPath) revalidatePath(workoutPath);
  return {};
}

export async function uncompleteSetFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const workoutPath = workoutPathFromForm(formData);
  const parsed = setIdSchema.safeParse({ setId: String(formData.get("setId") ?? "") });
  if (!parsed.success) return;
  try {
    await uncompleteSet(db, userId, parsed.data.setId);
  } catch (error) {
    reportActionFailure("uncompleteSet", error);
    return;
  }
  if (workoutPath) revalidatePath(workoutPath);
}

export async function addSetFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const workoutPath = workoutPathFromForm(formData);
  const parsed = addSetInputSchema.safeParse({
    workoutExerciseId: String(formData.get("workoutExerciseId") ?? ""),
  });
  if (!parsed.success) return;
  try {
    await addSet(db, userId, parsed.data.workoutExerciseId);
  } catch (error) {
    reportActionFailure("addSet", error);
    return;
  }
  if (workoutPath) revalidatePath(workoutPath);
}

export async function removeSetFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const workoutPath = workoutPathFromForm(formData);
  const parsed = setIdSchema.safeParse({ setId: String(formData.get("setId") ?? "") });
  if (!parsed.success) return;
  try {
    await removeSet(db, userId, parsed.data.setId);
  } catch (error) {
    reportActionFailure("removeSet", error);
    return;
  }
  if (workoutPath) revalidatePath(workoutPath);
}

export async function finishWorkoutFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const parsed = finishWorkoutInputSchema.safeParse({
    workoutId: String(formData.get("workoutId") ?? ""),
  });
  if (!parsed.success) return;
  try {
    await finishWorkout(db, userId, parsed.data.workoutId);
  } catch (error) {
    reportActionFailure("finishWorkout", error);
    return;
  }
  revalidatePath("/workouts");
  revalidatePath(`/workouts/${parsed.data.workoutId}`);
}

/**
 * The next page of history, for the list's "load older" control.
 *
 * A data-returning action rather than a form action: the reader is being appended
 * to, not navigated away from. The user id still comes from the session; the
 * cursor is unparseable input that `listWorkouts` treats as "start from the
 * newest page", and the exercise id is validated there too, next to the query
 * that casts it.
 */
export async function loadWorkoutPageAction(
  cursor: string | null,
  exerciseId: string | null,
): Promise<WorkoutPage> {
  const userId = await requireSessionUserId();
  return listWorkouts(db, userId, { cursor, exerciseId });
}
