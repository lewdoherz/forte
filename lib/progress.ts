import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "./db";
import type { SetType } from "@/schema/types";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "./timezone";

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
 * Completed sets of one exercise for one user's completed workouts,
 * chronological. Owner-scoped: no other user's data can be reached.
 * `timeZone` is the owner's stored zone, used for the range lower bound.
 */
export async function getCompletedSetRows(
  db: Kysely<Database>,
  userId: string,
  templateId: string,
  range: ProgressRange,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<CompletedSetRow[]> {
  const since = rangeStart(range, new Date(), timeZone);
  let query = db
    .selectFrom("workout_set as ws")
    .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
    .innerJoin("workout as w", "w.id", "we.workout_id")
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
    .where("w.owner_id", "=", userId)
    .where("w.ended_at", "is not", null)
    .where("ws.completed_at", "is not", null)
    .where("we.template_id", "=", templateId);
  if (since) query = query.where("w.started_at", ">=", since);

  const rows = await query.orderBy("w.started_at", "asc").orderBy("ws.position", "asc").execute();
  return rows.map((r) => ({
    workoutId: r.workout_id,
    startedAt: r.started_at,
    setType: r.set_type,
    reps: r.reps,
    weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
    rpe: r.rpe == null ? null : Number(r.rpe),
    durationSeconds: r.duration_seconds,
    distanceMeters: r.distance_meters,
  }));
}

export interface ProgressSummary {
  bestWeightKg: number | null;
  bestReps: number | null;
  totalSets: number;
  totalVolumeKg: number;
  sessions: number;
  bestEstimated1RmKg: number | null;
}

export function summarizeProgress(rows: CompletedSetRow[]): ProgressSummary {
  let bestWeightKg: number | null = null;
  let bestReps: number | null = null;
  let totalVolumeKg = 0;
  let bestEstimated1RmKg: number | null = null;
  const workouts = new Set<string>();

  for (const r of rows) {
    workouts.add(r.workoutId);
    if (r.weightKg != null && (bestWeightKg == null || r.weightKg > bestWeightKg)) {
      bestWeightKg = r.weightKg;
    }
    if (r.reps != null && (bestReps == null || r.reps > bestReps)) {
      bestReps = r.reps;
    }
    if (r.weightKg != null && r.reps != null) {
      totalVolumeKg += r.weightKg * r.reps;
      const e1rm = estimateOneRepMax(r.weightKg, r.reps);
      if (e1rm != null && (bestEstimated1RmKg == null || e1rm > bestEstimated1RmKg)) {
        bestEstimated1RmKg = e1rm;
      }
    }
  }

  return {
    bestWeightKg,
    bestReps,
    totalSets: rows.length,
    totalVolumeKg,
    sessions: workouts.size,
    bestEstimated1RmKg,
  };
}

export interface SessionPoint {
  workoutId: string;
  date: Date;
  bestWeightKg: number | null;
  volumeKg: number;
  sets: number;
}

export function buildSessionSeries(rows: CompletedSetRow[]): SessionPoint[] {
  const byWorkout = new Map<string, SessionPoint>();
  for (const r of rows) {
    let point = byWorkout.get(r.workoutId);
    if (!point) {
      point = { workoutId: r.workoutId, date: r.startedAt, bestWeightKg: null, volumeKg: 0, sets: 0 };
      byWorkout.set(r.workoutId, point);
    }
    point.sets += 1;
    if (r.weightKg != null && (point.bestWeightKg == null || r.weightKg > point.bestWeightKg)) {
      point.bestWeightKg = r.weightKg;
    }
    if (r.weightKg != null && r.reps != null) {
      point.volumeKg += r.weightKg * r.reps;
    }
  }
  return [...byWorkout.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface RecentSession {
  workoutId: string;
  date: Date;
  sets: CompletedSetRow[];
}

export function recentSession(rows: CompletedSetRow[]): RecentSession | null {
  if (rows.length === 0) return null;
  let latest = rows[0];
  for (const r of rows) {
    if (r.startedAt.getTime() > latest.startedAt.getTime()) latest = r;
  }
  return {
    workoutId: latest.workoutId,
    date: latest.startedAt,
    sets: rows.filter((r) => r.workoutId === latest.workoutId),
  };
}
