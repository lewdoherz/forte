import { z } from "zod";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "./timezone";

/**
 * Shared range vocabulary for progress views.
 *
 * Per-exercise analytics live in lib/exercise-statistics.ts and personal-record
 * policy lives in lib/records.ts. Keeping this module limited to URL validation
 * and timezone-aware range boundaries prevents a second analytics definition
 * from drifting away from those canonical policies.
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
