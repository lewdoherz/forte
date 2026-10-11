"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireSessionUserId } from "./auth-session";
import { reportFailure } from "./log";
import { getI18n } from "./i18n/server";
import type { MessageKey, Translate } from "./i18n";
import {
  discardWorkout,
  listWorkouts,
  startEmptyWorkout,
  startWorkout,
  syncWorkoutDocument,
  syncWorkoutInputSchemaFor,
} from "./workouts";
import { getPreviousPerformances, type PreviousPerformance } from "./previous-performance";
import { enrichWorkoutPage, type WorkoutCardPage } from "./workout-history";
import type { WorkoutSyncInput } from "./workout-sync";

/**
 * The shape of a value that reaches SQL as a `::uuid` cast. Kept loose on
 * purpose: a malformed id is simply not found, and the database is the
 * authority on what is a uuid.
 */
const uuidPattern = /^[0-9a-f-]{36}$/;

/**
 * The reader-facing wording for a rejected write. The sentinel errors stay
 * machine-readable (the sync caller classifies on them) while the text the
 * reader sees comes from the dictionary, resolved inside the action so the
 * message is in the language of the request that failed.
 */
function message(e: unknown, t: Translate, fallback: MessageKey): string {
  if (!(e instanceof Error)) return t(fallback);
  if (e.message === "not_authorized") return t("workouts.error.notAuthorized");
  if (e.message === "not_active") return t("workouts.error.finished");
  if (e.message === "already_finished") return t("workouts.error.finished");
  if (e.message === "invalid_ended_at") return t("workouts.error.invalidEndedAt");
  return t(fallback);
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
  if (!uuidPattern.test(routineId)) return;

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
 * Starts a workout with no exercises. Nothing is snapshotted from a routine, so
 * the document begins empty; the logger's Add Exercise builds it from there.
 */
export async function startEmptyWorkoutFormAction(): Promise<void> {
  const userId = await requireSessionUserId();
  const workout = await startEmptyWorkout(db, userId);
  revalidatePath("/workouts");
  redirect(`/workouts/${workout.id}`);
}

/**
 * The previous performance for one exercise, fetched when an exercise is added
 * mid-workout: the page could only preload the exercises it started with, and
 * the added one's history is unknown until asked for. A data-returning action
 * because the answer feeds the logger's local state rather than navigating.
 */
export async function previousPerformanceAction(
  templateId: string,
): Promise<PreviousPerformance | null> {
  const userId = await requireSessionUserId();
  // The id reaches SQL as a `::uuid` cast, so anything else is refused without
  // a query rather than thrown from the driver.
  if (!uuidPattern.test(templateId)) return null;
  const performances = await getPreviousPerformances(db, userId, [templateId]);
  return performances.get(templateId) ?? null;
}

/**
 * Discards an active workout outright. A data-returning action rather than a
 * form action so the logging screen can clear its local copy of the document
 * before navigating away — a leftover pending record would keep a workout that
 * no longer exists.
 */
export async function discardWorkoutAction(
  workoutId: string,
): Promise<{ ok: true } | { error: string }> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  if (!uuidPattern.test(workoutId)) return { error: t("workouts.error.notFound") };
  try {
    await discardWorkout(db, userId, workoutId);
  } catch (e) {
    reportActionFailure("discardWorkout", e);
    return { error: message(e, t, "workouts.error.discardFailed") };
  }
  revalidatePath("/workouts");
  return { ok: true };
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
  const { t } = await getI18n();
  const parsed = syncWorkoutInputSchemaFor(t).safeParse(input);
  if (!parsed.success) {
    // A malformed document is rejected identically on every attempt, so it is
    // permanent for this revision; the next edit sends a fresh one. The schema
    // is built for this request's translator, so its issue text is already in
    // the reader's language; the dictionary supplies the fallback for an issue
    // that carries none.
    return {
      error: parsed.error.issues[0]?.message ?? t("workouts.error.invalidState"),
      code: "permanent",
    };
  }
  try {
    await syncWorkoutDocument(db, userId, parsed.data);
  } catch (e) {
    reportActionFailure("syncWorkoutState", e);
    return {
      error: message(e, t, "workouts.error.syncFailed"),
      code: e instanceof Error && PERMANENT_SYNC_ERRORS.has(e.message) ? "permanent" : "transient",
    };
  }
  return { ok: true };
}
