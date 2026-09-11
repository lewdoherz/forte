import type { Kysely } from "kysely";
import type { Database } from "./db";
import type { SetType } from "@/schema/types";

/**
 * One exercise's completed sessions, with the sets that make up each one.
 *
 * `lib/progress.ts` exposes per-session aggregates (`getSessionSeries`) and the
 * most recent session's sets (`getRecentSession`), but not the sets of every
 * session. The History tab shows those rows, so this module reads them — it is a
 * plain read, not a second statistics implementation: the badges the tab renders
 * still come from `lib/progress.ts` (see `components/exercise-history.tsx`).
 *
 * The reads are bounded. Sessions are located with an ordered LIMIT before their
 * sets are fetched, so result size is capped by `limit` sessions rather than by
 * the unbounded number of sets logged for the exercise over time.
 */
export interface ExerciseHistorySet {
  setType: SetType;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
}

export interface ExerciseHistorySession {
  workoutId: string;
  title: string;
  date: Date;
  sets: ExerciseHistorySet[];
}

/** The History tab's page size; mirrors the workout history page size. */
export const EXERCISE_HISTORY_SESSION_LIMIT = 30;

export async function getExerciseHistorySessions(
  db: Kysely<Database>,
  userId: string,
  templateId: string,
  limit = EXERCISE_HISTORY_SESSION_LIMIT,
): Promise<ExerciseHistorySession[]> {
  const sessions = await db
    .selectFrom("workout_exercise as we")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .innerJoin("workout_set as ws", "ws.workout_exercise_id", "we.id")
    .select(["w.id as workout_id", "w.title", "w.started_at"])
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

  if (sessions.length === 0) return [];

  const rows = await db
    .selectFrom("workout_set as ws")
    .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
    .select([
      "we.workout_id as workout_id",
      "ws.set_type",
      "ws.reps",
      "ws.weight_kg",
      "ws.duration_seconds",
      "ws.distance_meters",
    ])
    .where(
      "we.workout_id",
      "in",
      sessions.map((session) => session.workout_id),
    )
    .where("we.template_id", "=", templateId)
    .where("ws.completed_at", "is not", null)
    // Sets are ordered within their exercise, then by their own position: a
    // template can legitimately appear more than once in one workout.
    .orderBy("we.position", "asc")
    .orderBy("ws.position", "asc")
    .execute();

  const setsBySession = new Map<string, ExerciseHistorySet[]>();
  for (const row of rows) {
    const sets = setsBySession.get(row.workout_id) ?? [];
    sets.push({
      setType: row.set_type,
      reps: row.reps,
      // node-postgres returns `numeric` as a string while PGlite returns a
      // number; normalising here keeps the two dialects identical.
      weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
      durationSeconds: row.duration_seconds,
      distanceMeters: row.distance_meters,
    });
    setsBySession.set(row.workout_id, sets);
  }

  return sessions.map((session) => ({
    workoutId: session.workout_id,
    title: session.title,
    date: session.started_at,
    sets: setsBySession.get(session.workout_id) ?? [],
  }));
}
