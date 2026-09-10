import type { SetType, WorkoutSet } from "@/schema/types";

/**
 * One set as the client believes it is, sent to reconcile a workout it owns.
 *
 * The id is client-generated so a replayed sync addresses the same row; the
 * rest are the fields the client models. `duration_seconds`, `distance_meters`,
 * `metrics` and `set_type` are deliberately absent: the logging screen does not
 * carry them, and a sync must not erase values it never saw.
 */
export interface SyncSet {
  id: string;
  workout_exercise_id: string;
  position: number;
  set_type: SetType;
  reps: number | null;
  weight_kg: string | null;
  rpe: string | null;
  completed_at: string | null;
}

/**
 * The whole document for one workout. `sets` is the COMPLETE desired set list,
 * not a delta — that completeness is what makes applying it idempotent and
 * order-independent (see docs/offline-logging.md).
 */
export interface WorkoutSyncInput {
  workoutId: string;
  endedAt: string | null;
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

/** Whether a stored row already carries every value the client is the source of. */
export function sameClientValues(desired: SyncSet, existing: WorkoutSet): boolean {
  return (
    desired.position === existing.position &&
    desired.reps === existing.reps &&
    sameNumeric(desired.weight_kg, existing.weight_kg) &&
    sameNumeric(desired.rpe, existing.rpe) &&
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
