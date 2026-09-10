import { Suspense } from "react";
import type { SetType } from "@/schema/types";
import { db } from "@/lib/db";
import { getVisibleExercise, listExercises } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import {
  PROGRESS_RANGES,
  RANGE_LABELS,
  estimateOneRepMax,
  getProgressSummary,
  getRecentSession,
  getSessionSeries,
  progressQuerySchema,
  type ProgressRange,
  type ProgressSummary,
  type RecentSession,
  type SessionPoint,
} from "@/lib/progress";
import { ProgressControls } from "@/components/progress-controls";
import { ProgressChart } from "@/components/progress-chart";
import { getUserProfile } from "@/lib/users";
import { DEFAULT_TIME_ZONE, formatDateTimeInTimeZone } from "@/lib/timezone";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {note ? <div className="mt-0.5 text-[10px] text-zinc-400">{note}</div> : null}
    </div>
  );
}

export default async function ProgressPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await requireSessionUserId();
  // The stored preference, not the browser or the server: range boundaries and
  // rendered dates must not shift with either.
  const profile = await getUserProfile(db, userId);
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;
  const params = await searchParams;
  const exerciseParam = typeof params.exercise === "string" ? params.exercise : "";
  const rangeParam = typeof params.range === "string" ? params.range : "all";
  const range: ProgressRange = (PROGRESS_RANGES as readonly string[]).includes(rangeParam)
    ? (rangeParam as ProgressRange)
    : "all";

  const exercises = await listExercises(db, userId, {});
  const options = exercises.map((e) => ({ id: e.id, title: e.title }));
  const ranges = PROGRESS_RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }));

  // Validate + authorize the selected exercise (system or the user's own custom).
  let selectedTitle: string | null = null;
  let summary: ProgressSummary | null = null;
  let series: SessionPoint[] = [];
  let recent: RecentSession | null = null;

  if (exerciseParam) {
    const parsed = progressQuerySchema.safeParse({ templateId: exerciseParam, range });
    if (parsed.success) {
      const exercise = await getVisibleExercise(db, parsed.data.templateId, userId);
      if (exercise) {
        selectedTitle = exercise.title;
        // Three bounded queries instead of loading every completed set: the
        // summary is a single row, the series one row per session, and the most
        // recent session one workout's sets.
        const [nextSummary, nextSeries, nextRecent] = await Promise.all([
          getProgressSummary(db, userId, exercise.id, range, timeZone),
          getSessionSeries(db, userId, exercise.id, range, timeZone),
          getRecentSession(db, userId, exercise.id, range, timeZone),
        ]);
        summary = nextSummary;
        series = nextSeries;
        recent = nextRecent;
      }
    }
  }

  const strengthPoints = series.flatMap((p) =>
    p.bestWeightKg != null ? [{ label: formatDateTimeInTimeZone(p.date, timeZone), value: p.bestWeightKg }] : [],
  );
  const volumePoints = series.map((p) => ({
    label: formatDateTimeInTimeZone(p.date, timeZone),
    value: p.volumeKg,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Progress</h1>

      <Suspense fallback={null}>
        <ProgressControls
          options={options}
          ranges={ranges}
          selectedId={selectedTitle ? exerciseParam : ""}
          range={range}
        />
      </Suspense>

      {options.length === 0 ? (
        <p className="mt-8 text-zinc-500">No exercises available.</p>
      ) : !selectedTitle || !summary ? (
        <p className="mt-8 text-zinc-500">Select an exercise to see progress.</p>
      ) : summary.totalSets === 0 ? (
        <p className="mt-8 text-zinc-500">
          No completed sets for {selectedTitle} in this range.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Best weight"
              value={summary.bestWeightKg != null ? `${summary.bestWeightKg} kg` : "—"}
            />
            <Stat label="Best reps" value={summary.bestReps != null ? String(summary.bestReps) : "—"} />
            <Stat
              label="Est. 1RM"
              value={summary.bestEstimated1RmKg != null ? `${Math.round(summary.bestEstimated1RmKg)} kg` : "—"}
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
              <h2 className="text-sm font-medium text-zinc-500">
                Most recent session · {formatDateTimeInTimeZone(recent.date, timeZone)}
              </h2>
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
      )}
    </main>
  );
}
