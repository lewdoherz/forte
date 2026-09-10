"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireSessionUserId } from "./auth-session";
import {
  addSet,
  addSetInputSchema,
  finishWorkout,
  finishWorkoutInputSchema,
  logSet,
  logSetInputSchema,
  removeSet,
  setIdSchema,
  startWorkout,
  uncompleteSet,
} from "./workouts";

export type LogSetState = { error?: string };

function message(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  if (e.message === "not_authorized") return "You don't have permission to do that.";
  if (e.message === "not_active") return "This workout is already finished.";
  if (e.message === "already_finished") return "This workout is already finished.";
  return fallback;
}

export async function startWorkoutFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const routineId = String(formData.get("routineId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(routineId)) return;

  let id: string;
  try {
    ({ id } = await startWorkout(db, userId, routineId));
  } catch {
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
  const workoutId = String(formData.get("workoutId") ?? "");
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
    return { error: message(e, "Could not save this set.") };
  }
  revalidatePath(`/workouts/${workoutId}`);
  return {};
}

export async function uncompleteSetFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const workoutId = String(formData.get("workoutId") ?? "");
  const parsed = setIdSchema.safeParse({ setId: String(formData.get("setId") ?? "") });
  if (!parsed.success) return;
  try {
    await uncompleteSet(db, userId, parsed.data.setId);
  } catch {
    return;
  }
  revalidatePath(`/workouts/${workoutId}`);
}

export async function addSetFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const workoutId = String(formData.get("workoutId") ?? "");
  const parsed = addSetInputSchema.safeParse({
    workoutExerciseId: String(formData.get("workoutExerciseId") ?? ""),
  });
  if (!parsed.success) return;
  try {
    await addSet(db, userId, parsed.data.workoutExerciseId);
  } catch {
    return;
  }
  revalidatePath(`/workouts/${workoutId}`);
}

export async function removeSetFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const workoutId = String(formData.get("workoutId") ?? "");
  const parsed = setIdSchema.safeParse({ setId: String(formData.get("setId") ?? "") });
  if (!parsed.success) return;
  try {
    await removeSet(db, userId, parsed.data.setId);
  } catch {
    return;
  }
  revalidatePath(`/workouts/${workoutId}`);
}

export async function finishWorkoutFormAction(formData: FormData): Promise<void> {
  const userId = await requireSessionUserId();
  const parsed = finishWorkoutInputSchema.safeParse({
    workoutId: String(formData.get("workoutId") ?? ""),
  });
  if (!parsed.success) return;
  try {
    await finishWorkout(db, userId, parsed.data.workoutId);
  } catch {
    return;
  }
  revalidatePath("/workouts");
  revalidatePath(`/workouts/${parsed.data.workoutId}`);
}
