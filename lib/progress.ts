import { z } from "zod";
import { sql, type Kysely } from "kysely";
import type { Database } from "./db";
import type { SetType } from "@/schema/types";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "./timezone";

/**
 * Per-exercise progress analytics.
 *
 * Everything here is DERIVED from completed sets at read time — nothing is
 * stored as an authoritative aggregate, so a corrected set immediately corrects
 * the stats.
 *
 * The aggregations run in SQL rather than folding rows in JavaScript. An earlier
 * implementation loaded every completed set for the exercise into memory to fold
 * it here; that result set is unbounded (it grows with training history forever)
 * and an index audit measured 11,540 rows for a single exercise. The queries are
 * now shaped so the result size is bounded by the number of SESSIONS — or is a
 * single row — regardless of how many sets those sessions contain.
 */

export const PROGRESS_RANGES = ["all", "30d", "90d", "1y"] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];

export const RANGE_LABELS: Record<ProgressRange, string> = {
  all: "All time",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "Last year",
};

export const progressQuerySchema = z.object({
  templateId: z.string().uuid(),
  range: z.enum(PROGRESS_RANGES),
});

/**
 * Inclusive lower bound for a range, or null for all time.
 *
 * The bound is the start of the user's LOCAL calendar day, so "last 30 days"
 * means 30 local days rather than 30 × 24h from an arbitrary server instant.
 * Pass the user's stored zone; the default is an explicit UTC, never the
 * server's ambient zone.
 */
export function rangeStart(
  range: ProgressRange,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | null {
  if (range === "all") return null;
  if (range === "30d") return startOfLocalDay(now, timeZone, { days: -30 });
  if (range === "90d") return startOfLocalDay(now, timeZone, { days: -90 });
  return startOfLocalDay(now, timeZone, { years: -1 });
}

/**
 * Epley estimated one-rep max: weight × (1 + reps / 30). Returns null unless
 * weight and reps are both positive, where the estimate would be meaningless.
 * This is always a calculated value, never an actually lifted weight.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps > 0)) return null;
  return weightKg * (1 + reps / 30);
}

export interface CompletedSetRow {
  workoutId: string;
  startedAt: Date;
  setType: SetType;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
}

/**
 * The shared filter for every progress query: the caller's own completed
 * workouts, completed sets only, one exercise, and an optional lower bound
 * expressed in the caller's timezone.
 *
 * Owner scoping lives here and only here, so no analytics query can widen its
 * scope by forgetting a predicate.
 */
function progressQuery(
  db: Kysely<Database>,
  userId: string,
  templateId: string,
  range: ProgressRange,
  timeZone: string,
) {
  const since = rangeStart(range, new Date(), timeZone);

  let query = db
    .selectFrom("workout_set as ws")
    .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .where("w.owner_id", "=", userId)
    .where("w.ended_at", "is not", null)
    .where("ws.completed_at", "is not", null)
    .where("we.template_id", "=", templateId);

  if (since) query = query.where("w.started_at", ">=", since);
  return query;
}

export interface ProgressSummary {
  bestWeightKg: number | null;
  bestReps: number | null;
  totalSets: number;
  totalVolumeKg: number;
  sessions: number;
  bestEstimated1RmKg: number | null;
}

/**
 * Summary for one exercise — a single row, aggregated by the database.
 *
 * Numeric and count results are cast in SQL (`::float8`, `::int`) rather than
 * converted in JavaScript: PostgreSQL returns `numeric` and `bigint` as strings
 * to node-postgres, while PGlite returns numbers, so an uncast aggregate would
 * behave differently between dialects.
 */
export async function getProgressSummary(
  db: Kysely<Database>,
  userId: string,
  templateId: string,
  range: ProgressRange,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<ProgressSummary> {
  const row = await progressQuery(db, userId, templateId, range, timeZone)
    .select([
      sql<number | null>`max(ws.weight_kg)::float8`.as("best_weight"),
      sql<number | null>`max(ws.reps)::int`.as("best_reps"),
      sql<number>`count(*)::int`.as("total_sets"),
      // NULL * anything is NULL and SUM skips NULLs, so a set missing either
      // value contributes nothing — the rule the previous fold applied.
      sql<number>`coalesce(sum(ws.weight_kg * ws.reps), 0)::float8`.as("total_volume"),
      sql<number>`count(distinct w.id)::int`.as("sessions"),
      // Guarded so a zero weight or zero reps contributes nothing, matching
      // estimateOneRepMax()'s contract exactly.
      sql<number | null>`max(case when ws.weight_kg > 0 and ws.reps > 0
            then ws.weight_kg * (1 + ws.reps / 30.0) end)::float8`.as("best_e1rm"),
    ])
    .executeTakeFirst();

  return {
    bestWeightKg: row?.best_weight ?? null,
    bestReps: row?.best_reps ?? null,
    totalSets: row?.total_sets ?? 0,
    totalVolumeKg: row?.total_volume ?? 0,
    sessions: row?.sessions ?? 0,
    bestEstimated1RmKg: row?.best_e1rm ?? null,
  };
}

export interface SessionPoint {
  workoutId: string;
  date: Date;
  bestWeightKg: number | null;
  volumeKg: number;
  sets: number;
}

/**
 * One point per session, grouped by the database — so the result is bounded by
 * the number of sessions rather than the number of sets.
 */
export async function getSessionSeries(
  db: Kysely<Database>,
  userId: string,
  templateId: string,
  range: ProgressRange,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<SessionPoint[]> {
  const rows = await progressQuery(db, userId, templateId, range, timeZone)
    .select([
      "w.id as workout_id",
      "w.started_at",
      sql<number | null>`max(ws.weight_kg)::float8`.as("best_weight"),
      sql<number>`coalesce(sum(ws.weight_kg * ws.reps), 0)::float8`.as("volume_kg"),
      sql<number>`count(*)::int`.as("sets"),
    ])
    .groupBy(["w.id", "w.started_at"])
    // `w.id` breaks ties so the order is deterministic when two sessions share a
    // start timestamp.
    .orderBy("w.started_at", "asc")
    .orderBy("w.id", "asc")
    .execute();

  return rows.map((row) => ({
    workoutId: row.workout_id,
    date: row.started_at,
    bestWeightKg: row.best_weight,
    volumeKg: row.volume_kg,
    sets: row.sets,
  }));
}

export interface RecentSession {
  workoutId: string;
  date: Date;
  sets: CompletedSetRow[];
}

/**
 * The most recent session's completed sets. Bounded by a single workout: the
 * latest one is located with an ordered LIMIT before its sets are read.
 *
 * The second query repeats the full filter (owner, completion, exercise, range)
 * and only then narrows to that workout, so scoping never depends on the id
 * alone.
 */
export async function getRecentSession(
  db: Kysely<Database>,
  userId: string,
  templateId: string,
  range: ProgressRange,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<RecentSession | null> {
  const latest = await progressQuery(db, userId, templateId, range, timeZone)
    .select(["w.id as workout_id", "w.started_at"])
    .orderBy("w.started_at", "desc")
    .orderBy("w.id", "desc")
    .limit(1)
    .executeTakeFirst();

  if (!latest) return null;

  const rows = await progressQuery(db, userId, templateId, range, timeZone)
    .select([
      "w.id as workout_id",
      "w.started_at",
      "ws.set_type",
      "ws.reps",
      "ws.weight_kg",
      "ws.rpe",
      "ws.duration_seconds",
      "ws.distance_meters",
    ])
    .where("w.id", "=", latest.workout_id)
    .orderBy("ws.position", "asc")
    .execute();

  return {
    workoutId: latest.workout_id,
    date: latest.started_at,
    sets: rows.map((row) => ({
      workoutId: row.workout_id,
      startedAt: row.started_at,
      setType: row.set_type,
      reps: row.reps,
      weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
      rpe: row.rpe == null ? null : Number(row.rpe),
      durationSeconds: row.duration_seconds,
      distanceMeters: row.distance_meters,
    })),
  };
}
