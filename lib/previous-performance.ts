import { sql, type Kysely } from "kysely";
import type { Database } from "./db";
import type { WorkoutSet } from "@/schema/types";

/**
 * "Last time you did this" — the values the logger offers alongside each set
 * while a workout is in progress.
 *
 * Only completed sets from finished workouts count. Applying the same
 * `workout.ended_at is not null` and `workout_set.completed_at is not null`
 * predicates as Statistics, History, and Records keeps an in-progress workout
 * provisional and prevents a routine prescription from becoming a previous
 * performance.
 *
 * The last-session query is bounded by that session's sets. A second projection
 * selects only the latest valid candidate per set type and metric; older
 * compatible values can fill a gap without shipping the user's whole history.
 */

/**
 * A previous set's recorded values, in the canonical set vocabulary so callers
 * can hand them straight to `formatSetValues` (lib/workout-stats.ts) instead of
 * rebuilding a `WorkoutSet` or writing a second per-type switch. `floors` and
 * `steps` ride along inside `metrics`, where the schema keeps them.
 */
export type PreviousSetValues = Pick<
  WorkoutSet,
  "set_type" | "reps" | "weight_kg" | "duration_seconds" | "distance_meters" | "rpe" | "metrics"
>;

export interface PreviousPerformance {
  performedAt: Date;
  sets: PreviousSetValues[];
  /** Latest valid completed candidates per set type/metric, for empty defaults. */
  fallbackSets?: PreviousSetValues[];
}

/**
 * For each requested template id, the most recent completed performance of that
 * exercise, keyed by template id. Exercises with no completed history are
 * absent from the map — callers render an empty state rather than a zero.
 *
 * Alignment is by set index: `sets[i]` is the previous session's i-th completed
 * set for the exercise, in `position` order. It is index-aligned rather than
 * matched on `position` because `position` is per exercise-instance, not a
 * global set number, and because a skipped set should not shift later sets; the
 * logger numbers its rows the same way. A session with fewer sets simply has no
 * entry for the extra indexes.
 */
export async function getPreviousPerformances(
  db: Kysely<Database>,
  userId: string,
  templateIds: string[],
): Promise<Map<string, PreviousPerformance>> {
  // Kysely's `in` needs a non-empty list; with nothing asked for there is
  // nothing to look up.
  if (templateIds.length === 0) return new Map();

  const latestSession = db
    .selectFrom("workout_exercise as we")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .select(["we.id as workout_exercise_id", "we.template_id", "w.started_at"])
    // `distinct on` keeps the first row per template in the ORDER BY below.
    .distinctOn("we.template_id")
    .where("w.owner_id", "=", userId)
    .where("w.ended_at", "is not", null)
    .where("we.template_id", "in", templateIds)
    // A workout finished without logging the exercise is not a performance;
    // skipping it lets an earlier real session stand in, which is what the user
    // means by "last time".
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("workout_set as ws")
          .select(sql<number>`1`.as("one"))
          .whereRef("ws.workout_exercise_id", "=", "we.id")
          .where("ws.completed_at", "is not", null),
      ),
    )
    .orderBy("we.template_id", "asc")
    // Ordered by start time, the same total order the history list and the
    // progress series use, so "most recent" means one thing across the app.
    .orderBy("w.started_at", "desc")
    // The workout id breaks ties between two sessions that share a start
    // timestamp, and the exercise position breaks ties when the same template
    // appears twice in one workout — both make the "most recent" pick total.
    .orderBy("w.id", "desc")
    .orderBy("we.position", "asc");

  const rows = await db
    .selectFrom(latestSession.as("latest"))
    .innerJoin("workout_set as ws", "ws.workout_exercise_id", "latest.workout_exercise_id")
    .select([
      "latest.template_id",
      "latest.started_at",
      "ws.set_type",
      "ws.reps",
      "ws.weight_kg",
      "ws.duration_seconds",
      "ws.distance_meters",
      "ws.rpe",
      "ws.metrics",
    ])
    .where("ws.completed_at", "is not", null)
    .orderBy("latest.template_id", "asc")
    .orderBy("ws.position", "asc")
    .execute();

  const performances = new Map<string, PreviousPerformance>();
  for (const row of rows) {
    let performance = performances.get(row.template_id);
    if (!performance) {
      performance = { performedAt: row.started_at, sets: [], fallbackSets: [] };
      performances.set(row.template_id, performance);
    }
    performance.sets.push({
      set_type: row.set_type,
      reps: row.reps,
      weight_kg: row.weight_kg,
      duration_seconds: row.duration_seconds,
      distance_meters: row.distance_meters,
      rpe: row.rpe,
      metrics: row.metrics,
    });
  }
  // At most one row per (template, set type, metric). A recent session can
  // contain only reps, for example; that must not hide an earlier valid load.
  const fallback = await sql<PreviousSetValues & { template_id: string; id: string }>`
    select distinct on (we.template_id, ws.set_type, candidate.field)
      we.template_id, ws.id, ws.set_type, ws.reps, ws.weight_kg,
      ws.duration_seconds, ws.distance_meters, ws.rpe, ws.metrics
    from workout_set ws
    join workout_exercise we on we.id = ws.workout_exercise_id
    join workout w on w.id = we.workout_id
    cross join lateral (values
      ('weight', ws.weight_kg is not null),
      ('reps', ws.reps is not null and ws.reps > 0),
      ('duration', ws.duration_seconds is not null and ws.duration_seconds > 0),
      ('distance', ws.distance_meters is not null and ws.distance_meters > 0),
      ('rpe', ws.rpe is not null),
      ('floors', jsonb_typeof(ws.metrics -> 'floors') = 'number'),
      ('steps', jsonb_typeof(ws.metrics -> 'steps') = 'number')
    ) candidate(field, present)
    where w.owner_id = ${userId}::uuid
      and w.ended_at is not null and ws.completed_at is not null
      and we.template_id in (${sql.join(templateIds.map((id) => sql`${id}::uuid`))})
      and candidate.present
    order by we.template_id, ws.set_type, candidate.field,
      w.started_at desc, w.id desc, we.position asc, ws.position asc
  `.execute(db);
  const seen = new Set<string>();
  for (const row of fallback.rows) {
    const key = `${row.template_id}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    performances.get(row.template_id)?.fallbackSets?.push(row);
  }
  return performances;
}
