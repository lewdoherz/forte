import type {
  ExerciseTemplate,
  JsonObject,
  SetType,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@/schema/types";

/**
 * One set as the client believes it is, sent to reconcile a workout it owns.
 *
 * The id is client-generated so a replayed sync addresses the same row; the
 * rest are the fields the client models. Typed metric fields are optional for
 * old documents: omission preserves their stored values, while explicit null
 * clears a field. New logger documents send the complete metric projection.
 */
export interface SyncSet {
  id: string;
  workout_exercise_id: string;
  position: number;
  set_type: SetType;
  reps: number | null;
  weight_kg: string | null;
  rpe: string | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
  metrics?: JsonObject;
  completed_at: string | null;
}

/**
 * The template columns the logging screen renders: title, muscle and — for the
 * per-type value formatter — exercise type. The full row is read live from the
 * catalog on the server (`getWorkoutTree`), so the client never needs how-to
 * text or media urls, and an exercise added mid-workout can carry the same
 * shape without the page shipping the whole catalog to the browser.
 */
export type LoggedTemplate = Pick<
  ExerciseTemplate,
  "id" | "slug" | "title" | "exercise_type" | "primary_muscle"
>;

export interface LoggedExercise extends WorkoutExercise {
  template: LoggedTemplate;
  sets: WorkoutSet[];
}

/**
 * The active-workout document the logger renders and the offline store keeps.
 * `WorkoutTree` is assignable to it, so the server render is the first paint.
 */
export interface LoggedWorkout extends Workout {
  exercises: LoggedExercise[];
}

/**
 * One exercise as the client believes it is, sent to reconcile a workout it
 * owns.
 *
 * The client generates the id when an exercise is added mid-workout, so a
 * replayed sync addresses the same row; `template_id` is identity and never
 * changes. Rest targets and notes belong to this workout snapshot, not to the
 * routine the workout originally came from.
 */
export interface SyncExercise {
  id: string;
  template_id: string;
  position: number;
  superset_key: string | null;
  rest_seconds: number | null;
  notes: string | null;
}

/**
 * The whole document for one workout. `exercises` and `sets` are the COMPLETE
 * desired lists, not deltas — that completeness is what makes applying the
 * document idempotent and order-independent (see docs/offline-logging.md).
 * Exercises are reconciled before sets because a newly added exercise must
 * exist before its sets can reference it, and a removed one takes its sets with
 * it.
 */
export interface WorkoutSyncInput {
  workoutId: string;
  endedAt: string | null;
  exercises: SyncExercise[];
  sets: SyncSet[];
}

/** numeric columns come back as strings carrying their declared scale. */
function sameNumeric(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}

function sameInstant(a: string | null, b: Date | null): boolean {
  if (a === null || b === null) return a === null && b === null;
  const time = new Date(a).getTime();
  return !Number.isNaN(time) && time === b.getTime();
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((value, index) => sameJson(value, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}

/** Whether a stored row already carries every value the client is the source of. */
export function sameClientValues(desired: SyncSet, existing: WorkoutSet): boolean {
  return (
    desired.position === existing.position &&
    desired.set_type === existing.set_type &&
    desired.reps === existing.reps &&
    sameNumeric(desired.weight_kg, existing.weight_kg) &&
    sameNumeric(desired.rpe, existing.rpe) &&
    (desired.duration_seconds === undefined || desired.duration_seconds === existing.duration_seconds) &&
    (desired.distance_meters === undefined || desired.distance_meters === existing.distance_meters) &&
    (desired.metrics === undefined || sameJson(desired.metrics, existing.metrics)) &&
    sameInstant(desired.completed_at, existing.completed_at)
  );
}

export interface SetReconciliation {
  insert: SyncSet[];
  update: SyncSet[];
  remove: string[];
}

/**
 * Pure diff of a desired set list against the stored rows: new ids to insert,
 * present ids to update, and the ids of stored sets the client no longer has.
 *
 * `update` holds every desired set that already exists, changed or not. The
 * caller skips the unchanged ones with `sameClientValues`, because an UPDATE
 * rewrites `updated_at` through a table trigger even when no value differs, and
 * a replayed sync must be a no-op.
 */
export function planSetReconciliation(
  desired: SyncSet[],
  existing: WorkoutSet[],
): SetReconciliation {
  const existingIds = new Set(existing.map((s) => s.id));
  const desiredIds = new Set(desired.map((s) => s.id));

  return {
    insert: desired.filter((s) => !existingIds.has(s.id)),
    update: desired.filter((s) => existingIds.has(s.id)),
    remove: existing.filter((s) => !desiredIds.has(s.id)).map((s) => s.id),
  };
}

/**
 * Whether a stored exercise already carries every value the client is the
 * source of. `template_id` is identity, not a value: it is checked separately
 * so a document that renames an exercise is rejected rather than silently
 * rewritten.
 */
export function sameExerciseValues(
  desired: SyncExercise,
  existing: WorkoutExercise,
): boolean {
  return (
    desired.position === existing.position &&
    desired.superset_key === existing.superset_key &&
    desired.rest_seconds === existing.rest_seconds &&
    desired.notes === existing.notes
  );
}

export interface ExerciseReconciliation {
  insert: SyncExercise[];
  update: SyncExercise[];
  remove: string[];
}

/**
 * Pure diff of a desired exercise list against the stored rows. The same shape
 * as the set diff, with the same reason for listing unchanged rows under
 * `update`: the caller skips them so a replay writes nothing.
 */
export function planExerciseReconciliation(
  desired: SyncExercise[],
  existing: WorkoutExercise[],
): ExerciseReconciliation {
  const existingIds = new Set(existing.map((e) => e.id));
  const desiredIds = new Set(desired.map((e) => e.id));

  return {
    insert: desired.filter((e) => !existingIds.has(e.id)),
    update: desired.filter((e) => existingIds.has(e.id)),
    remove: existing.filter((e) => !desiredIds.has(e.id)).map((e) => e.id),
  };
}
