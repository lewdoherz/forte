import type { SetType } from "@/schema/types";
import { db } from "@/lib/db";
import {
  estimateOneRepMax,
  getProgressSummary,
  getRecentSession,
  getSessionSeries,
  type ProgressRange,
} from "@/lib/progress";
import { ProgressChart } from "@/components/progress-chart";
import { formatDateTimeInTimeZone } from "@/lib/timezone";

/**
 * The range the statistics tab shows. `all` is the default `/progress` falls back
 * to when no range is chosen, and a single exercise's history is small enough
 * that narrowing it would hide the shape of the progression rather than help.
 */
const STATS_RANGE: ProgressRange = "all";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {note ? <div className="mt-0.5 text-[10px] text-zinc-400">{note}</div> : null}
    </div>
  );
}

/**
 * One exercise's progress, reusing `lib/progress`'s three bounded reads and the
 * same chart the /progress page renders. It is the same series, not a second
 * statistics implementation: the summary is one aggregated row, the chart points
 * one per session, and the recent sets one workout's worth.
 */
export async function ExerciseStats({
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
  const [summary, series, recent] = await Promise.all([
    getProgressSummary(db, userId, exerciseId, STATS_RANGE, timeZone),
    getSessionSeries(db, userId, exerciseId, STATS_RANGE, timeZone),
    getRecentSession(db, userId, exerciseId, STATS_RANGE, timeZone),
  ]);

  // No sets means no line to draw; saying so beats charting an empty axis range.
  if (summary.totalSets === 0) {
    return <p className="text-zinc-500">No completed sets for {exerciseTitle} yet.</p>;
  }

  const strengthPoints = series.flatMap((p) =>
    p.bestWeightKg != null
      ? [{ label: formatDateTimeInTimeZone(p.date, timeZone), value: p.bestWeightKg }]
      : [],
  );
  const volumePoints = series.map((p) => ({
    label: formatDateTimeInTimeZone(p.date, timeZone),
    value: p.volumeKg,
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Best weight"
          value={summary.bestWeightKg != null ? `${summary.bestWeightKg} kg` : "—"}
        />
        <Stat label="Best reps" value={summary.bestReps != null ? String(summary.bestReps) : "—"} />
        <Stat
          label="Est. 1RM"
          value={
            summary.bestEstimated1RmKg != null
              ? `${Math.round(summary.bestEstimated1RmKg)} kg`
              : "—"
          }
          note="Epley estimate, not lifted"
        />
        <Stat
          label="Total volume"
          value={`${Math.round(summary.totalVolumeKg).toLocaleString()} kg`}
        />
        <Stat label="Sessions" value={String(summary.sessions)} />
        <Stat label="Completed sets" value={String(summary.totalSets)} />
      </div>

      <ProgressChart title="Best weight per session" unit="kg" points={strengthPoints} />
      <ProgressChart title="Volume per session" unit="kg" points={volumePoints} />

      {recent ? (
        <section className="mt-8">
          <h3 className="text-sm font-medium text-zinc-500">
            Most recent session · {formatDateTimeInTimeZone(recent.date, timeZone)}
          </h3>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
            {recent.sets.map((s, i) => {
              const e1rm =
                s.weightKg != null && s.reps != null ? estimateOneRepMax(s.weightKg, s.reps) : null;
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 px-4 py-2 text-sm">
                  <span className="w-20 text-xs text-zinc-500">{SET_TYPE_LABELS[s.setType]}</span>
                  <span>
                    {s.reps != null ? `${s.reps} reps` : "—"}
                    {s.weightKg != null ? ` × ${s.weightKg} kg` : ""}
                    {s.rpe != null ? ` @ RPE ${s.rpe}` : ""}
                  </span>
                  {e1rm != null ? (
                    <span className="text-xs text-zinc-400">est. 1RM {Math.round(e1rm)} kg</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
