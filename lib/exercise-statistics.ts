import { sql, type Kysely } from "kysely";
import type { Database } from "./db";
import type { DurationRecordDirection, ExerciseTemplate } from "@/schema/types";
import {
  bestRecordCandidates,
  directionFor,
  recordCategoriesForExerciseType,
  type RecordCandidate,
  type RecordCategory,
} from "./records";
import { PERF_COLUMNS } from "./records-history";
import { rangeStart, type ProgressRange } from "./progress";
import { DEFAULT_TIME_ZONE } from "./timezone";

/**
 * Everything the exercise page's Statistics tab reads, in two bounded queries.
 *
 * The shape follows the Records engine: only completed sets from finished
 * workouts count. Per-category bests use the same `PERF_COLUMNS` expressions
 * as historical record baselines, and the JavaScript fold reuses
 * `bestRecordCandidates`, so summaries, charts, and records share one policy.
 *
 * Both queries aggregate to one row per session before anything is folded in
 * JavaScript. Transfer is therefore bounded by the number of workouts in which
 * the exercise appears, never by the number of sets.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** Every aggregate column a session row can carry. */
type BestColumnKey =
  | "heaviest_weight"
  | "best_e1rm"
  | "most_reps"
  | "best_set_volume"
  | "lowest_assistance"
  | "max_duration"
  | "min_duration"
  | "longest_distance"
  | "best_pace"
  | "most_floors"
  | "best_floors_per_minute"
  | "most_steps"
  | "best_steps_per_minute";

interface SessionRow {
  workout_id: string;
  workout_title: string;
  started_at: Date;
  completed_sets: number;
  volume_kg: number;
  total_reps: number;
  heaviest_weight: number | null;
  best_e1rm: number | null;
  most_reps: number | null;
  best_set_volume: number | null;
  lowest_assistance: number | null;
  max_duration: number | null;
  min_duration: number | null;
  longest_distance: number | null;
  best_pace: number | null;
  most_floors: number | null;
  best_floors_per_minute: number | null;
  most_steps: number | null;
  best_steps_per_minute: number | null;
}

/** One workout's best value per category, plus that session's volume. */
export interface ExerciseSessionStats {
  workoutId: string;
  workoutTitle: string;
  startedAt: Date;
  completedSets: number;
  volumeKg: number;
  totalReps: number;
  bests: Partial<Record<RecordCategory, number>>;
}

/** Folded totals for one range. */
export interface ExerciseRangeTotals {
  sessions: number;
  completedSets: number;
  volumeKg: number;
  totalReps: number;
  bests: Partial<Record<RecordCategory, number>>;
}

/**
 * The all-time best in one category and the session that first reached it. The
 * session is a workout, not a set: the engine collapses a workout's sets to one
 * candidate per category before comparing, so the date a record was set is that
 * workout's date.
 */
export interface ExercisePersonalRecord {
  category: RecordCategory;
  value: number;
  workoutId: string;
  workoutTitle: string;
  achievedAt: Date;
}

export interface ExerciseStatistics {
  /** Completed sets in finished workouts across all time. */
  allTimeCompletedSets: number;
  /** Totals over the selected range. */
  totals: ExerciseRangeTotals;
  /** One row per session in the selected range, oldest first. */
  sessions: ExerciseSessionStats[];
  /** All-time best per relevant category, in the engine's canonical order. */
  personalRecords: ExercisePersonalRecord[];
}

// ---------------------------------------------------------------------------
// Category -> SQL column
// ---------------------------------------------------------------------------

/**
 * Which aggregate carries a category. `heaviest_weight` and
 * `heaviest_added_weight` share one column for the same reason the baseline
 * query maps both to `base_heaviest_weight`: they are one measurement, split
 * into two labels so a weighted pull-up never reads as a barbell lift. Duration
 * is the only category whose column depends on the exercise's direction —
 * `best_duration` is a max or a min, while `longest_duration` is always a max.
 */
function bestColumnFor(
  category: RecordCategory,
  direction: DurationRecordDirection,
): BestColumnKey {
  switch (category) {
    case "heaviest_weight":
    case "heaviest_added_weight":
      return "heaviest_weight";
    case "best_e1rm":
      return "best_e1rm";
    case "most_reps":
      return "most_reps";
    case "best_set_volume":
      return "best_set_volume";
    case "lowest_assistance":
      return "lowest_assistance";
    case "best_duration":
      return direction === "lower" ? "min_duration" : "max_duration";
    case "longest_duration":
      return "max_duration";
    case "longest_distance":
      return "longest_distance";
    case "best_pace":
      return "best_pace";
    case "most_floors":
      return "most_floors";
    case "best_floors_per_minute":
      return "best_floors_per_minute";
    case "most_steps":
      return "most_steps";
    case "best_steps_per_minute":
      return "best_steps_per_minute";
  }
}

/**
 * One finished session, aggregated by the database. Requiring both a finished
 * workout and a completed set prevents an in-progress logger value from
 * entering durable statistics or personal records before the user finishes.
 */
function sessionQuery(
  db: Kysely<Database>,
  userId: string,
  templateId: string,
  since: Date | null,
) {
  let query = db
    .selectFrom("workout_set as ws")
    .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    // Casts in SQL, because PostgreSQL hands `numeric` and `bigint` back as
    // strings while PGlite hands back numbers; an uncast aggregate would behave
    // differently between the two dialects.
    .select([
      "w.id as workout_id",
      "w.title as workout_title",
      "w.started_at",
      sql<number>`count(*)::int`.as("completed_sets"),
      sql<number>`coalesce(sum(ws.weight_kg * ws.reps), 0)::float8`.as("volume_kg"),
      sql<number>`coalesce(sum(ws.reps), 0)::int`.as("total_reps"),
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
    .where("w.ended_at", "is not", null)
    .where("we.template_id", "=", templateId)
    .where("ws.completed_at", "is not", null)
    .groupBy(["w.id", "w.title", "w.started_at"])
    .orderBy("w.started_at", "asc")
    // Breaks ties between workouts that share a start instant, so the "first to
    // reach a value" below is deterministic on every dialect.
    .orderBy("w.id", "asc");

  if (since) query = query.where("w.started_at", ">=", since);
  return query;
}

function toSessionStats(
  row: SessionRow,
  categories: readonly RecordCategory[],
  direction: DurationRecordDirection,
): ExerciseSessionStats {
  const bests: Partial<Record<RecordCategory, number>> = {};
  for (const category of categories) {
    const value = row[bestColumnFor(category, direction)];
    // The SQL already applies every guard (positive weight, positive duration,
    // non-zero counts); this only keeps a null out of the fold.
    if (typeof value === "number" && Number.isFinite(value)) bests[category] = value;
  }
  return {
    workoutId: row.workout_id,
    workoutTitle: row.workout_title,
    startedAt: row.started_at,
    completedSets: row.completed_sets,
    volumeKg: row.volume_kg,
    totalReps: row.total_reps,
    bests,
  };
}

/**
 * The best value per category across sessions, using the engine's own collapse
 * so the comparison rule (and its "a tie is not a record") is defined once. A
 * candidate per (session, category) is enough because the wide row is already a
 * workout's best per category.
 */
function foldBests(
  sessions: readonly ExerciseSessionStats[],
  categories: readonly RecordCategory[],
  direction: DurationRecordDirection,
): Partial<Record<RecordCategory, number>> {
  const candidates: RecordCandidate[] = [];
  for (const session of sessions) {
    for (const category of categories) {
      const value = session.bests[category];
      if (value !== undefined) {
        candidates.push({ category, value, direction: directionFor(category, direction) });
      }
    }
  }
  const best: Partial<Record<RecordCategory, number>> = {};
  for (const candidate of bestRecordCandidates(candidates)) {
    best[candidate.category] = candidate.value;
  }
  return best;
}

function buildPersonalRecords(
  sessions: readonly ExerciseSessionStats[],
  categories: readonly RecordCategory[],
  direction: DurationRecordDirection,
): ExercisePersonalRecord[] {
  const bests = foldBests(sessions, categories, direction);
  const records: ExercisePersonalRecord[] = [];
  for (const category of categories) {
    const value = bests[category];
    if (value === undefined) continue;
    // The EARLIEST session reaching the best value. A later equal performance is
    // a tie, which the engine never treats as a new record, so it must not
    // re-date the record either.
    const session = sessions.find((candidate) => candidate.bests[category] === value);
    if (!session) continue;
    records.push({
      category,
      value,
      workoutId: session.workoutId,
      workoutTitle: session.workoutTitle,
      achievedAt: session.startedAt,
    });
  }
  return records;
}

/**
 * The Statistics tab's data. `sessions` and `totals` are bounded by the range;
 * `personalRecords` is always all-time, because a personal record is not a
 * windowed statistic. When the range is all time, the all-time query is the
 * range query and only one statement is issued.
 */
export async function getExerciseStatistics(
  db: Kysely<Database>,
  userId: string,
  exercise: Pick<ExerciseTemplate, "id" | "exercise_type" | "duration_record_direction">,
  range: ProgressRange,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<ExerciseStatistics> {
  const since = rangeStart(range, new Date(), timeZone);
  const direction = exercise.duration_record_direction;
  const categories = recordCategoriesForExerciseType(exercise.exercise_type, direction);

  // The all-time query is needed for the PRs either way; issue it alongside the
  // range query rather than after it, so two statements — not a waterfall.
  const allTimePromise =
    since === null ? null : sessionQuery(db, userId, exercise.id, null).execute();
  const rangeRows = await sessionQuery(db, userId, exercise.id, since).execute();
  const allTimeRows = allTimePromise ? await allTimePromise : rangeRows;

  const sessions = rangeRows.map((row) => toSessionStats(row, categories, direction));
  const allTimeSessions = allTimeRows.map((row) => toSessionStats(row, categories, direction));

  return {
    allTimeCompletedSets: allTimeSessions.reduce((sum, session) => sum + session.completedSets, 0),
    totals: {
      sessions: sessions.length,
      completedSets: sessions.reduce((sum, session) => sum + session.completedSets, 0),
      volumeKg: sessions.reduce((sum, session) => sum + session.volumeKg, 0),
      totalReps: sessions.reduce((sum, session) => sum + session.totalReps, 0),
      bests: foldBests(sessions, categories, direction),
    },
    sessions,
    personalRecords: buildPersonalRecords(allTimeSessions, categories, direction),
  };
}
