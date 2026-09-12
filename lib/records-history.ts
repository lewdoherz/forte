import { sql, type Kysely } from "kysely";
import type { Database } from "./db";
import {
  compareRecordCandidates,
  extractSetRecordCandidates,
  type RecordBaseline,
  type RecordOutcome,
  type RecordSetValues,
} from "./records";
import type { DurationRecordDirection, ExerciseType } from "@/schema/types";

/**
 * The historical baseline for the Records system.
 *
 * A record is exercise- and category-specific and comes from completed sets
 * only, compared against the same exercise's completed performances STRICTLY
 * BEFORE the workout being evaluated. This module answers one question for one
 * workout, or for a page of them: what was each exercise's best value per
 * category before this workout, and therefore which records did it earn.
 *
 * Everything here is derived — there is no records table and no PR columns.
 * The baseline is a window over the user's own history, so deleting or editing
 * an old workout changes later answers with no recalculation step, and
 * re-deriving the same history always returns the same result.
 *
 * Two facts make that deterministic:
 *
 *  - Time is Forte's stored `workout.started_at`, never wall-clock `now()` and
 *    never `created_at` (which moves when a workout is edited). `started_at`
 *    is the ordering the history list, progress series and previous-performance
 *    lookup already use, so "before" means the same thing everywhere.
 *  - `workout.id` breaks the tie between two workouts that share a start
 *    timestamp. Two sessions at the same instant have no wall-clock order;
 *    this gives them a stable total order instead, so a rerun — or a second
 *    user reading the same rows — sees the same baseline.
 *
 * The baseline is computed over one row per (exercise, workout), not one row
 * per set. A workout must not advance its own baseline set by set: `80×8, 90×5,
 * 100×3` is one heaviest-weight performance, so the window frame aggregates the
 * workout first and only then looks at strictly earlier workouts.
 *
 * Only `completed_at is not null` is required, per the Records spec's
 * "completed sets only". Note lib/progress.ts and lib/previous-performance.ts
 * additionally require the workout to have ended; that is deliberately not
 * copied here — a completed set in an unfinished workout is still a completed
 * performance, and the workout being evaluated is itself excluded from its own
 * baseline by construction.
 */

/** An earned record, tagged with the exercise it belongs to. */
export interface EarnedRecord extends RecordOutcome {
  templateId: string;
  exerciseType: ExerciseType;
}

/** The window definition shared by every baseline column. */
const PRECEDING = sql`partition by p.template_id
  order by p.started_at asc, p.workout_id asc
  rows between unbounded preceding and 1 preceding`;

// jsonb sidecar metrics, read as a double so rates compare against the JS
// candidate values in the same arithmetic. A missing key casts to NULL and
// fails the > 0 guard, which is exactly "never record".
const FLOORS = sql<number | null>`(ws.metrics->>'floors')::float8`;
const STEPS = sql<number | null>`(ws.metrics->>'steps')::float8`;

// Every expression below mirrors lib/records.ts's candidate guards and, as far
// as IEEE-754 allows, its operation order. Casting to float8 before any
// arithmetic is load-bearing: PostgreSQL `numeric` division would round
// differently from the double the pure comparison computes, and an exact tie
// could stop being a tie. So the record rule is duplicated here only because
// SQL and TypeScript cannot share one expression — the guards, the e1RM rep
// cap, the one-rep special case and the rate/pace operator order are all the
// rules in lib/records.ts, not new ones.

/**
 * Best per (exercise, workout) before any history is applied. Exported so a
 * caller that needs per-workout bests reuses these guards instead of writing a
 * third SQL copy of the record rules.
 */
export const PERF_COLUMNS = {
  heaviest_weight: sql<number | null>`max(case when ws.weight_kg > 0 then ws.weight_kg::float8 end)`,
  // A single is the actual load, not Epley's inflated weight × 31/30, and an
  // estimate above E1RM_MAX_REPS is extrapolation — both guards from
  // estimatedOneRepMaxForRecord. This intentionally diverges from
  // getProgressSummary.bestEstimated1RmKg, which has neither.
  best_e1rm: sql<number | null>`max(case
    when ws.reps between 1 and 12 and ws.weight_kg > 0 then
      case when ws.reps = 1 then ws.weight_kg::float8
           else ws.weight_kg::float8 * (1 + ws.reps::float8 / 30::float8) end
    end)`,
  most_reps: sql<number | null>`max(case when ws.reps > 0 then ws.reps::float8 end)`,
  best_set_volume: sql<number | null>`max(case
    when ws.weight_kg > 0 and ws.reps > 0 then ws.weight_kg::float8 * ws.reps::float8 end)`,
  // Fewer assisted kilograms is the better performance, so the pre-workout
  // baseline is a MIN. Zero assistance is a legitimate best.
  lowest_assistance: sql<number | null>`min(case when ws.weight_kg >= 0 then ws.weight_kg::float8 end)`,
  max_duration: sql<number | null>`max(case when ws.duration_seconds > 0 then ws.duration_seconds::float8 end)`,
  min_duration: sql<number | null>`min(case when ws.duration_seconds > 0 then ws.duration_seconds::float8 end)`,
  longest_distance: sql<number | null>`max(case when ws.distance_meters > 0 then ws.distance_meters::float8 end)`,
  best_pace: sql<number | null>`max(case
    when ws.distance_meters > 0 and ws.duration_seconds > 0
    then ws.distance_meters::float8 / ws.duration_seconds::float8 end)`,
  most_floors: sql<number | null>`max(case when ${FLOORS} > 0 then ${FLOORS} end)`,
  best_floors_per_minute: sql<number | null>`max(case
    when ${FLOORS} > 0 and ws.duration_seconds > 0
    then (${FLOORS} * 60) / ws.duration_seconds::float8 end)`,
  most_steps: sql<number | null>`max(case when ${STEPS} > 0 then ${STEPS} end)`,
  best_steps_per_minute: sql<number | null>`max(case
    when ${STEPS} > 0 and ws.duration_seconds > 0
    then (${STEPS} * 60) / ws.duration_seconds::float8 end)`,
} as const;

interface BaselineRow {
  workout_id: string;
  template_id: string;
  base_heaviest_weight: number | null;
  base_best_e1rm: number | null;
  base_most_reps: number | null;
  base_best_set_volume: number | null;
  base_lowest_assistance: number | null;
  base_duration_high: number | null;
  base_duration_low: number | null;
  base_longest_distance: number | null;
  base_best_pace: number | null;
  base_most_floors: number | null;
  base_best_floors_per_minute: number | null;
  base_most_steps: number | null;
  base_best_steps_per_minute: number | null;
}

/** One exercise's completed sets within one workout, ready for extraction. */
interface ExerciseGroup {
  exerciseType: ExerciseType;
  direction: DurationRecordDirection;
  position: number;
  sets: RecordSetValues[];
}

function baselineKey(workoutId: string, templateId: string): string {
  // UUIDs contain no colon, so this is unambiguous without a separator scheme.
  return `${workoutId}:${templateId}`;
}

/**
 * Turns a wide baseline row into the per-category map the pure comparison
 * reads. A category absent from the map is first-ever; a category whose column
 * is NULL because no earlier workout carried a value is genuinely absent, not
 * zero.
 */
function toBaseline(row: BaselineRow, direction: DurationRecordDirection): RecordBaseline {
  const baseline: RecordBaseline = {};
  const put = (category: keyof RecordBaseline, value: number | null) => {
    if (value !== null) baseline[category] = value;
  };

  // heaviest_weight and heaviest_added_weight share one rule (weight > 0) and
  // therefore one column; they are separate categories so a weighted-bodyweight
  // badge never reads as a barbell one.
  put("heaviest_weight", row.base_heaviest_weight);
  put("heaviest_added_weight", row.base_heaviest_weight);
  put("best_e1rm", row.base_best_e1rm);
  put("most_reps", row.base_most_reps);
  put("best_set_volume", row.base_best_set_volume);
  put("lowest_assistance", row.base_lowest_assistance);
  put("longest_distance", row.base_longest_distance);
  put("best_pace", row.base_best_pace);
  put("most_floors", row.base_most_floors);
  put("best_floors_per_minute", row.base_best_floors_per_minute);
  put("most_steps", row.base_most_steps);
  put("best_steps_per_minute", row.base_best_steps_per_minute);

  // `longest_duration` is always upwards (weight_duration). `best_duration`
  // follows the exercise's setting; `none` leaves it absent, matching the
  // extractor, which drops the category entirely.
  put("longest_duration", row.base_duration_high);
  if (direction === "higher") put("best_duration", row.base_duration_high);
  if (direction === "lower") put("best_duration", row.base_duration_low);

  return baseline;
}

/**
 * The earned records for one workout or a page of them, keyed by workout id.
 *
 * This is the batch primitive behind `getWorkoutRecords` and
 * `getWorkoutRecordCounts`, exported because a list view (the exercise History
 * tab) needs each row's records, not just the counts — calling
 * `getWorkoutRecords` per row would be an N+1. Each workout's list is ordered
 * by the workout's exercise position and then canonical category order, and is
 * tagged with the exercise each record belongs to, so a caller showing one
 * exercise filters to it without re-running the comparison. Every requested id
 * is present; an unknown id maps to an empty list.
 *
 * Load every requested workout's completed sets once, load every pre-workout
 * baseline once, compare. Three round trips regardless of how many workouts or
 * sets are involved: the window query, the candidate-set query (issued
 * together), and nothing else. There is no per-workout query.
 */
export async function getEarnedRecordsForWorkouts(
  db: Kysely<Database>,
  userId: string,
  workoutIds: readonly string[],
): Promise<Map<string, EarnedRecord[]>> {
  const ids = [...new Set(workoutIds)];
  const records = new Map<string, EarnedRecord[]>();
  for (const id of ids) records.set(id, []);
  if (ids.length === 0) return records;

  // One row per (exercise, workout) with that workout's best per category...
  const perf = db
    .selectFrom("workout_set as ws")
    .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .select(["we.template_id", "w.id as workout_id", "w.started_at"])
    .select([
      PERF_COLUMNS.heaviest_weight.as("heaviest_weight"),
      PERF_COLUMNS.best_e1rm.as("best_e1rm"),
      PERF_COLUMNS.most_reps.as("most_reps"),
      PERF_COLUMNS.best_set_volume.as("best_set_volume"),
      PERF_COLUMNS.lowest_assistance.as("lowest_assistance"),
      PERF_COLUMNS.max_duration.as("max_duration"),
      PERF_COLUMNS.min_duration.as("min_duration"),
      PERF_COLUMNS.longest_distance.as("longest_distance"),
      PERF_COLUMNS.best_pace.as("best_pace"),
      PERF_COLUMNS.most_floors.as("most_floors"),
      PERF_COLUMNS.best_floors_per_minute.as("best_floors_per_minute"),
      PERF_COLUMNS.most_steps.as("most_steps"),
      PERF_COLUMNS.best_steps_per_minute.as("best_steps_per_minute"),
    ])
    .where("w.owner_id", "=", userId)
    .where("ws.completed_at", "is not", null)
    // Only exercises the requested workouts actually contain can need a
    // baseline; this keeps the window from scanning the user's entire catalog.
    .where("we.template_id", "in", (eb) =>
      eb
        .selectFrom("workout_exercise as twe")
        .select("twe.template_id")
        .where("twe.workout_id", "in", ids),
    )
    .groupBy(["we.template_id", "w.id", "w.started_at"]);

  // ...then a window that, for each such row, folds only the rows before it.
  const ranked = db
    .selectFrom(perf.as("p"))
    .select([
      "p.template_id",
      "p.workout_id",
      sql<number | null>`max(p.heaviest_weight) over (${PRECEDING})`.as("base_heaviest_weight"),
      sql<number | null>`max(p.best_e1rm) over (${PRECEDING})`.as("base_best_e1rm"),
      sql<number | null>`max(p.most_reps) over (${PRECEDING})`.as("base_most_reps"),
      sql<number | null>`max(p.best_set_volume) over (${PRECEDING})`.as("base_best_set_volume"),
      sql<number | null>`min(p.lowest_assistance) over (${PRECEDING})`.as("base_lowest_assistance"),
      sql<number | null>`max(p.max_duration) over (${PRECEDING})`.as("base_duration_high"),
      sql<number | null>`min(p.min_duration) over (${PRECEDING})`.as("base_duration_low"),
      sql<number | null>`max(p.longest_distance) over (${PRECEDING})`.as("base_longest_distance"),
      sql<number | null>`max(p.best_pace) over (${PRECEDING})`.as("base_best_pace"),
      sql<number | null>`max(p.most_floors) over (${PRECEDING})`.as("base_most_floors"),
      sql<number | null>`max(p.best_floors_per_minute) over (${PRECEDING})`.as(
        "base_best_floors_per_minute",
      ),
      sql<number | null>`max(p.most_steps) over (${PRECEDING})`.as("base_most_steps"),
      sql<number | null>`max(p.best_steps_per_minute) over (${PRECEDING})`.as(
        "base_best_steps_per_minute",
      ),
    ]);

  // The requested workouts' exercises, so baselines come back only for the
  // (workout, exercise) pairs that were actually asked about.
  const target = db
    .selectFrom("workout as w")
    .innerJoin("workout_exercise as we", "we.workout_id", "w.id")
    .select(["w.id as workout_id", "we.template_id"])
    .distinct()
    .where("w.owner_id", "=", userId)
    .where("w.id", "in", ids);

  const baselineQuery = db
    .selectFrom(target.as("t"))
    .leftJoin(ranked.as("r"), (join) =>
      join.onRef("r.workout_id", "=", "t.workout_id").onRef("r.template_id", "=", "t.template_id"),
    )
    .select([
      "t.workout_id",
      "t.template_id",
      "r.base_heaviest_weight",
      "r.base_best_e1rm",
      "r.base_most_reps",
      "r.base_best_set_volume",
      "r.base_lowest_assistance",
      "r.base_duration_high",
      "r.base_duration_low",
      "r.base_longest_distance",
      "r.base_best_pace",
      "r.base_most_floors",
      "r.base_best_floors_per_minute",
      "r.base_most_steps",
      "r.base_best_steps_per_minute",
    ]);

  // Every completed set of every requested workout, projected to exactly what
  // the pure extractor reads. `we.position` orders the workout's exercises so
  // the returned records follow the workout's own order.
  const candidateQuery = db
    .selectFrom("workout_set as ws")
    .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .innerJoin("exercise_template as et", "et.id", "we.template_id")
    .select([
      "w.id as workout_id",
      "we.template_id",
      "we.position as exercise_position",
      "et.exercise_type",
      "et.duration_record_direction",
      "ws.completed_at",
      "ws.reps",
      "ws.weight_kg",
      "ws.duration_seconds",
      "ws.distance_meters",
      "ws.metrics",
    ])
    .where("w.owner_id", "=", userId)
    .where("w.id", "in", ids)
    .where("ws.completed_at", "is not", null)
    .orderBy("w.id", "asc")
    .orderBy("we.position", "asc")
    .orderBy("ws.position", "asc");

  const [baselineRows, candidateRows] = await Promise.all([
    baselineQuery.execute(),
    candidateQuery.execute(),
  ]);

  const baselines = new Map<string, BaselineRow>();
  for (const row of baselineRows) {
    baselines.set(baselineKey(row.workout_id, row.template_id), row);
  }

  const groups = new Map<string, Map<string, ExerciseGroup>>();
  for (const row of candidateRows) {
    let byTemplate = groups.get(row.workout_id);
    if (!byTemplate) {
      byTemplate = new Map();
      groups.set(row.workout_id, byTemplate);
    }
    let group = byTemplate.get(row.template_id);
    if (!group) {
      group = {
        exerciseType: row.exercise_type,
        direction: row.duration_record_direction,
        position: row.exercise_position,
        sets: [],
      };
      byTemplate.set(row.template_id, group);
    }
    group.sets.push({
      completed_at: row.completed_at,
      reps: row.reps,
      weight_kg: row.weight_kg,
      duration_seconds: row.duration_seconds,
      distance_meters: row.distance_meters,
      metrics: row.metrics,
    });
  }

  for (const [workoutId, byTemplate] of groups) {
    const ordered = [...byTemplate.entries()].sort((a, b) => a[1].position - b[1].position);
    const earned: EarnedRecord[] = [];
    for (const [templateId, group] of ordered) {
      const candidates = group.sets.flatMap((set) =>
        extractSetRecordCandidates(set, group.exerciseType, group.direction),
      );
      const row = baselines.get(baselineKey(workoutId, templateId));
      const baseline = row ? toBaseline(row, group.direction) : {};
      for (const outcome of compareRecordCandidates(candidates, baseline)) {
        // First-ever results establish the baseline and score nothing.
        if (outcome.firstEver) continue;
        earned.push({ templateId, exerciseType: group.exerciseType, ...outcome });
      }
    }
    records.set(workoutId, earned);
  }

  return records;
}

/**
 * One workout's earned records, ordered by the workout's exercise position and
 * then by canonical category order. Empty means no records — never null, and a
 * first-ever performance contributes nothing.
 */
export async function getWorkoutRecords(
  db: Kysely<Database>,
  userId: string,
  workoutId: string,
): Promise<EarnedRecord[]> {
  const records = await getEarnedRecordsForWorkouts(db, userId, [workoutId]);
  return records.get(workoutId) ?? [];
}

/**
 * Record counts for a page of workouts, keyed by workout id. Every requested id
 * is present; a workout with nothing earned maps to 0. The count is the number
 * of distinct (exercise, category) pairs that strictly improved — which is
 * exactly the length of its `getWorkoutRecords` list.
 */
export async function getWorkoutRecordCounts(
  db: Kysely<Database>,
  userId: string,
  workoutIds: readonly string[],
): Promise<Map<string, number>> {
  const derived = await getEarnedRecordsForWorkouts(db, userId, workoutIds);
  const counts = new Map<string, number>();
  for (const [workoutId, records] of derived) {
    counts.set(workoutId, records.length);
  }
  return counts;
}
