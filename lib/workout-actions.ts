"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireSessionUserId } from "./auth-session";
import { reportFailure } from "./log";
import {
  listWorkouts,
  startWorkout,
  syncWorkoutInputSchema,
  syncWorkoutSets,
} from "./workouts";
import { enrichWorkoutPage, type WorkoutCardPage } from "./workout-history";
import type { WorkoutSyncInput } from "./workout-sync";

function message(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  if (e.message === "not_authorized") return "You don't have permission to do that.";
  if (e.message === "not_active") return "This workout is already finished.";
  if (e.message === "already_finished") return "This workout is already finished.";
  if (e.message === "invalid_ended_at") return "That finish time is outside the workout.";
  return fallback;
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
  "invalid_ended_at",
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
): Promise<WorkoutCardPage> {
  const userId = await requireSessionUserId();
  return enrichWorkoutPage(db, userId, await listWorkouts(db, userId, { cursor, exerciseId }));
}

/**
 * Sentinel errors a replay of the same document reproduces exactly — an
 * ownership loss, a workout finished elsewhere, a deleted workout, a finish time
 * the server will keep rejecting. A sync failing this way will fail the same way
 * forever, so the client stops retrying it until a new local edit supersedes the
 * document.
 */
const PERMANENT_SYNC_ERRORS = new Set([
  "not_authorized",
  "not_active",
  "already_finished",
  "invalid_ended_at",
  "not_found",
]);

/**
 * Machine-readable outcome of a rejected sync.
 *
 * The logging screen has to decide whether retrying can ever help, and it used
 * to do that by matching the user-facing message. That coupling breaks silently
 * the first time a message is reworded — the retry loop would quietly revert to
 * hammering a request that cannot succeed — so the classification is made here,
 * where the sentinel errors are actually known, and returned alongside the
 * message.
 */
export type SyncFailureCode = "permanent" | "transient";

/**
 * Applies an offline-logged workout document. The whole payload is
 * attacker-controlled, so it is validated before anything reaches the
 * reconciliation, and the owner always comes from the session rather than the
 * document.
 *
 * A data-returning action rather than a form action: the client retries it from
 * an outbox and needs the outcome to decide whether to keep the queued changes.
 */

export async function syncWorkoutStateAction(
  input: WorkoutSyncInput,
): Promise<{ ok: true } | { error: string; code: SyncFailureCode }> {
  const userId = await requireSessionUserId();
  const parsed = syncWorkoutInputSchema.safeParse(input);
  if (!parsed.success) {
    // A malformed document is rejected identically on every attempt, so it is
    // permanent for this revision; the next edit sends a fresh one.
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid workout state.",
      code: "permanent",
    };
  }
  try {
    await syncWorkoutSets(db, userId, parsed.data);
  } catch (e) {
    reportActionFailure("syncWorkoutState", e);
    return {
      error: message(e, "Could not sync this workout."),
      code: e instanceof Error && PERMANENT_SYNC_ERRORS.has(e.message) ? "permanent" : "transient",
    };
  }
  return { ok: true };
}
