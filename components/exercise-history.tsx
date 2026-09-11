import Link from "next/link";
import type { SetType } from "@/schema/types";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { formatDateTimeInTimeZone } from "@/lib/timezone";
import { estimateOneRepMax, getSessionSeries } from "@/lib/progress";
import {
  EXERCISE_HISTORY_SESSION_LIMIT,
  getExerciseHistorySessions,
  type ExerciseHistorySet,
} from "@/lib/exercise-history";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

function formatSet(set: ExerciseHistorySet): string {
  if (set.weightKg != null && set.reps != null) return `${set.weightKg} kg × ${set.reps}`;
  if (set.reps != null) return `${set.reps} reps`;
  if (set.durationSeconds != null) return formatDuration(set.durationSeconds);
  if (set.distanceMeters != null) return `${set.distanceMeters} m`;
  return "—";
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

/**
 * The History tab: one card per completed session, newest first, with this
 * exercise's sets and that session's bests.
 *
 * Best weight and volume come from `getSessionSeries` — the same SQL aggregate
 * the Statistics tab's chart and summary use — so the two tabs cannot disagree.
 * Per-session best 1RM is not exposed by `lib/progress.ts` (only the all-time
 * maximum is), so it is derived here by applying the exported
 * `estimateOneRepMax` to each set and taking the session's maximum; that is the
 * exact formula the summary's `max(...)` uses, not a second definition of it.
 */
export async function ExerciseHistory({
  userId,
  exerciseId,
  exerciseTitle,
  timeZone,
}: {
  userId: string;
  exerciseId: string;
  exerciseTitle: string;
  timeZone: string;
}) {
  const [series, sessions] = await Promise.all([
    getSessionSeries(db, userId, exerciseId, "all", timeZone),
    getExerciseHistorySessions(db, userId, exerciseId),
  ]);

  if (sessions.length === 0) {
    return <p className="text-zinc-500">No workouts include {exerciseTitle} yet.</p>;
  }

  const pointByWorkout = new Map(series.map((point) => [point.workoutId, point]));

  return (
    <>
      <ul className="space-y-4">
        {sessions.map((session) => {
          const point = pointByWorkout.get(session.workoutId);
          const bestOneRepMax = session.sets.reduce<number | null>((best, set) => {
            if (set.weightKg == null || set.reps == null) return best;
            const estimate = estimateOneRepMax(set.weightKg, set.reps);
            if (estimate == null) return best;
            return best == null || estimate > best ? estimate : best;
          }, null);

          return (
            <li
              key={session.workoutId}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
                <Link href={`/workouts/${session.workoutId}`} className="font-medium hover:underline">
                  {session.title}
                </Link>
                <span className="text-xs text-zinc-500">
                  {formatDateTimeInTimeZone(session.date, timeZone)}
                </span>
              </div>

              <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                {session.sets.map((set, index) => (
                  <li key={index} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-16 shrink-0 text-[11px] text-zinc-500">
                      {SET_TYPE_LABELS[set.setType]}
                    </span>
                    <span>{formatSet(set)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2 border-t border-zinc-100 px-4 py-3">
                <Badge
                  label="Best Weight"
                  value={point?.bestWeightKg != null ? `${point.bestWeightKg} kg` : "—"}
                />
                <Badge
                  label="Best Volume"
                  value={point ? `${Math.round(point.volumeKg).toLocaleString()} kg` : "—"}
                />
                <Badge
                  label="Best 1 Rep Max"
                  value={bestOneRepMax != null ? `${Math.round(bestOneRepMax)} kg` : "—"}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {sessions.length >= EXERCISE_HISTORY_SESSION_LIMIT ? (
        <p className="mt-4 text-center text-sm text-zinc-500">
          Showing the {EXERCISE_HISTORY_SESSION_LIMIT} most recent sessions.
        </p>
      ) : null}
    </>
  );
}
