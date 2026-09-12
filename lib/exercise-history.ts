import type { Kysely } from "kysely";
import type { Database } from "./db";
import type { ExerciseType, SetType } from "@/schema/types";
import type { RecordCategory } from "./records";
import { getEarnedRecordsForWorkouts } from "./records-history";
import type { FormattableSet } from "./workout-stats";

/**
 * The History tab's data: this exercise's completed sessions, each with the
 * completed sets that make it up and the records it earned for this exercise.
 *
 * `lib/progress.ts` exposes per-session aggregates (`getSessionSeries`) and the
 * most recent session's sets (`getRecentSession`), but not every session's set
 * rows; the History tab renders those rows, so this module reads them. It is a
 * plain read, not a second statistics implementation: the record indicators are
 * derived by the Records engine (`lib/records-history.ts`), and the set values
 * are formatted by the shared formatter (`lib/workout-stats.ts`).
 *
 * A session is a completed occurrence only when the workout has ended and the
 * exercise has at least one completed set. Routine templates never appear, and
 * an unfinished set (the logger copies planned reps and weight onto one when a
 * workout starts) is never a performance.
 *
 * The reads are batched and bounded. Sessions are located with an ordered LIMIT
 * before their sets are fetched, so the result is capped by `limit` sessions
 * rather than by the unbounded number of sets logged over time; the sets and
 * the records for those sessions are then fetched once for the whole page.
 * Nothing here runs per row.
 */

/**
 * A completed set. Every field the shared formatter reads rides along, plus the
 * set type for the row label, so the view never rebuilds a `WorkoutSet` or
 * writes its own per-type switch.
 */
export interface ExerciseHistorySet extends FormattableSet {
  setType: SetType;
}

/** One completed occurrence of the exercise, with its sets in order. */
export interface ExerciseHistorySession {
  workoutId: string;
  title: string;
  date: Date;
  sets: ExerciseHistorySet[];
  /**
   * The records this workout earned FOR THIS EXERCISE, in canonical category
   * order — at most one per category. A first-ever performance and a workout
   * that ties the standing best earn nothing, so an empty list is the normal
   * case. Derived from the rows on every read and never stored, so deleting or
   * editing a workout changes the indicators with no recalculation step.
   */
  records: RecordCategory[];
}

export interface ExerciseHistoryResult {
  /**
   * The exercise's type, for the shared formatter. Null only when there are no
   * sessions: the join that supplies it is the same one that finds them, and
   * that is exactly the empty state the view renders.
   */
  exerciseType: ExerciseType | null;
  sessions: ExerciseHistorySession[];
}

/** The History tab's page size; mirrors the workout history page size. */
export const EXERCISE_HISTORY_SESSION_LIMIT = 30;

export async function getExerciseHistory(
  db: Kysely<Database>,
  userId: string,
  templateId: string,
  limit = EXERCISE_HISTORY_SESSION_LIMIT,
): Promise<ExerciseHistoryResult> {
  const sessions = await db
    .selectFrom("workout_exercise as we")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .innerJoin("workout_set as ws", "ws.workout_exercise_id", "we.id")
    .innerJoin("exercise_template as et", "et.id", "we.template_id")
    .select(["w.id as workout_id", "w.title", "w.started_at", "et.exercise_type"])
    .distinct()
    .where("w.owner_id", "=", userId)
    .where("w.ended_at", "is not", null)
    .where("ws.completed_at", "is not", null)
    .where("we.template_id", "=", templateId)
    .orderBy("w.started_at", "desc")
    // The id breaks ties so the limit is deterministic when two sessions share a
    // start timestamp — the same ordering `getRecentSession` uses.
    .orderBy("w.id", "desc")
    .limit(limit)
    .execute();

  if (sessions.length === 0) return { exerciseType: null, sessions: [] };

  const workoutIds = sessions.map((session) => session.workout_id);

  // The sets and the records are independent, so they are issued together; both
  // are one statement for the whole page. The records derivation applies the
  // same completed-set rule, so the sets a record was earned on are exactly the
  // sets this view shows.
  const [rows, earnedByWorkout] = await Promise.all([
    db
      .selectFrom("workout_set as ws")
      .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
      .select([
        "we.workout_id as workout_id",
        "ws.set_type",
        "ws.reps",
        "ws.weight_kg",
        "ws.duration_seconds",
        "ws.distance_meters",
        "ws.rpe",
        "ws.metrics",
      ])
      .where("we.workout_id", "in", workoutIds)
      .where("we.template_id", "=", templateId)
      .where("ws.completed_at", "is not", null)
      // Sets are ordered within their exercise, then by their own position: a
      // template can legitimately appear more than once in one workout.
      .orderBy("we.position", "asc")
      .orderBy("ws.position", "asc")
      .execute(),
    getEarnedRecordsForWorkouts(db, userId, workoutIds),
  ]);

  const setsBySession = new Map<string, ExerciseHistorySet[]>();
  for (const row of rows) {
    const sets = setsBySession.get(row.workout_id) ?? [];
    sets.push({
      setType: row.set_type,
      reps: row.reps,
      // `numeric` arrives in its precision-preserving driver form (a string
      // like "100.000"); the shared formatter trims and parses it, so the raw
      // value is passed straight through rather than parsed here.
      weight_kg: row.weight_kg,
      duration_seconds: row.duration_seconds,
      distance_meters: row.distance_meters,
      rpe: row.rpe,
      metrics: row.metrics,
    });
    setsBySession.set(row.workout_id, sets);
  }

  return {
    exerciseType: sessions[0].exercise_type,
    sessions: sessions.map((session) => ({
      workoutId: session.workout_id,
      title: session.title,
      date: session.started_at,
      sets: setsBySession.get(session.workout_id) ?? [],
      records:
        earnedByWorkout
          .get(session.workout_id)
          ?.filter((record) => record.templateId === templateId)
          .map((record) => record.category) ?? [],
    })),
  };
}
