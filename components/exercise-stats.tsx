import Link from "next/link";
import type { DurationRecordDirection, ExerciseType } from "@/schema/types";
import { db } from "@/lib/db";
import { getVisibleExercise } from "@/lib/exercises";
import {
  getExerciseStatistics,
  type ExerciseRangeTotals,
  type ExerciseStatistics,
} from "@/lib/exercise-statistics";
import { PROGRESS_RANGES, RANGE_LABELS, type ProgressRange } from "@/lib/progress";
import { RECORD_CATEGORY_LABELS, type RecordCategory } from "@/lib/records";
import { formatVolumeKg } from "@/lib/workout-stats";
import { ProgressChart } from "@/components/progress-chart";
import { formatDateTimeInTimeZone } from "@/lib/timezone";

/**
 * One exercise's statistics, on the exercise page's Statistics tab.
 *
 * Every number here is derived from completed sets by lib/exercise-statistics,
 * which shares the Records engine's guards (`PERF_COLUMNS`) and comparison
 * (`bestRecordCandidates`) — so the summary, the chart and the PR list agree
 * with the records shown in Workout Detail by construction, not by convention.
 * What is displayed depends on the exercise's TYPE: a distance run has no
 * "best weight", and a step machine has no "best reps", so each type gets its
 * own summary fields, chart metric and PR categories rather than one generic
 * weight-and-reps panel. Values are canonical (kg, seconds, metres, and rates
 * per minute); nothing is stored, so a corrected set corrects this view.
 */

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/** A summary tile: either one record category's best, or a range total. */
type SummaryMetric =
  | { kind: "category"; category: RecordCategory }
  | { kind: "volume" }
  | { kind: "reps" }
  | { kind: "sessions" }
  | { kind: "sets" };

/**
 * What "summary" means for each exercise type, in the order to show it. The
 * categories are exactly the ones the Records engine extracts for that type, so
 * a tile can never present a metric the exercise does not measure.
 */
const SUMMARY_BY_TYPE: Record<ExerciseType, readonly SummaryMetric[]> = {
  weight_reps: [
    { kind: "category", category: "heaviest_weight" },
    { kind: "category", category: "best_e1rm" },
    { kind: "volume" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  bodyweight_reps: [
    { kind: "category", category: "most_reps" },
    { kind: "reps" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  bodyweight_weighted: [
    { kind: "category", category: "heaviest_added_weight" },
    { kind: "category", category: "most_reps" },
    { kind: "reps" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  bodyweight_assisted: [
    { kind: "category", category: "lowest_assistance" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  reps_only: [
    { kind: "category", category: "most_reps" },
    { kind: "reps" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  duration: [
    { kind: "category", category: "best_duration" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  weight_duration: [
    { kind: "category", category: "heaviest_weight" },
    { kind: "category", category: "longest_duration" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  distance_duration: [
    { kind: "category", category: "longest_distance" },
    { kind: "category", category: "best_pace" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  short_distance_weight: [
    { kind: "category", category: "heaviest_weight" },
    { kind: "category", category: "longest_distance" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  floors_duration: [
    { kind: "category", category: "most_floors" },
    { kind: "category", category: "best_floors_per_minute" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
  steps_duration: [
    { kind: "category", category: "most_steps" },
    { kind: "category", category: "best_steps_per_minute" },
    { kind: "sessions" },
    { kind: "sets" },
  ],
};

// ---------------------------------------------------------------------------
// Formatting (canonical units)
// ---------------------------------------------------------------------------

/** A recorded number without the noise of "\"70.00\"" — 70 is 70 kg. */
function trimNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** Canonical seconds, shown as a clock once the value passes a minute. */
function formatSeconds(total: number): string {
  const rounded = Math.round(total);
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

/**
 * One category's value in its own canonical unit. The switch is over categories,
 * not exercise types, so two types that share a category (a heaviest weight is a
 * heaviest weight) format identically. It is display only — the value itself
 * stays canonical, which is what the verification asserts.
 */
function formatCategoryValue(category: RecordCategory, value: number): string {
  switch (category) {
    case "heaviest_weight":
    case "heaviest_added_weight":
    case "lowest_assistance":
      return `${trimNumber(value)} kg`;
    case "best_e1rm":
    case "best_set_volume":
      // Estimates and set volumes are whole kilograms; a fractional part would
      // imply precision the Epley estimate does not have.
      return `${Math.round(value)} kg`;
    case "most_reps":
      return `${value} ${value === 1 ? "rep" : "reps"}`;
    case "best_duration":
    case "longest_duration":
      return formatSeconds(value);
    case "longest_distance":
      return `${trimNumber(value)} m`;
    case "best_pace":
      return `${value.toFixed(2)} m/s`;
    case "most_floors":
      return `${value} ${value === 1 ? "floor" : "floors"}`;
    case "best_floors_per_minute":
      return `${value.toFixed(1)} floors/min`;
    case "most_steps":
      return `${value} ${value === 1 ? "step" : "steps"}`;
    case "best_steps_per_minute":
      return `${value.toFixed(1)} steps/min`;
  }
}

function summaryValue(metric: SummaryMetric, totals: ExerciseRangeTotals): number | null {
  switch (metric.kind) {
    case "category":
      return totals.bests[metric.category] ?? null;
    case "volume":
      return totals.volumeKg;
    case "reps":
      return totals.totalReps;
    case "sessions":
      return totals.sessions;
    case "sets":
      return totals.completedSets;
  }
}

function summaryLabel(metric: SummaryMetric): string {
  switch (metric.kind) {
    // The category's wording comes from the Records vocabulary, so a tile and a
    // record badge never word the same metric differently.
    case "category":
      return RECORD_CATEGORY_LABELS[metric.category];
    case "volume":
      return "Total volume";
    case "reps":
      return "Total reps";
    case "sessions":
      return "Sessions";
    case "sets":
      return "Completed sets";
  }
}

function formatSummaryValue(metric: SummaryMetric, value: number): string {
  if (metric.kind === "category") return formatCategoryValue(metric.category, value);
  if (metric.kind === "volume") return formatVolumeKg(value);
  if (metric.kind === "reps") return `${value} ${value === 1 ? "rep" : "reps"}`;
  return String(value);
}

/** The one estimate on the page, and the policy that makes it a record. */
function summaryNote(metric: SummaryMetric): string | undefined {
  return metric.kind === "category" && metric.category === "best_e1rm"
    ? "Epley, sets of 12 reps or fewer; a single is its load"
    : undefined;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {note ? <div className="mt-0.5 text-[10px] text-zinc-400">{note}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

interface ChartSpec {
  category: RecordCategory;
  title: string;
  unit: string;
  /** Set only for a metric whose useful values are fractional. */
  formatValue?: (value: number) => string;
}

/**
 * The metric worth charting for each type — the one whose movement means
 * progress. A weight_reps chart plots estimated 1RM rather than raw weight,
 * because a heavy single and a lighter high-rep set are not comparable loads; a
 * run plots pace, because raw duration rewards short runs. The e1RM series uses
 * the Records rule (12-rep cap, a single is its load), which is deliberately
 * narrower than /progress's Epley-for-everything summary — the divergence is
 * documented in lib/records.ts, not silently aligned here.
 */
function chartSpecFor(
  exerciseType: ExerciseType,
  direction: DurationRecordDirection,
): ChartSpec {
  switch (exerciseType) {
    case "weight_reps":
      return { category: "best_e1rm", title: "Best e1RM per session", unit: "kg" };
    case "bodyweight_reps":
      return { category: "most_reps", title: "Best reps per session", unit: "reps" };
    case "bodyweight_weighted":
      return { category: "heaviest_added_weight", title: "Best added weight per session", unit: "kg" };
    case "bodyweight_assisted":
      return {
        category: "lowest_assistance",
        title: "Lowest assistance per session",
        unit: "kg",
      };
    case "reps_only":
      return { category: "most_reps", title: "Best reps per session", unit: "reps" };
    case "duration":
      return {
        category: "best_duration",
        title:
          direction === "lower"
            ? "Fastest time per session"
            : direction === "none"
              ? "Duration per session"
              : "Longest hold per session",
        unit: "s",
      };
    case "weight_duration":
      return { category: "heaviest_weight", title: "Best weight per session", unit: "kg" };
    case "distance_duration":
      return {
        category: "best_pace",
        title: "Best pace per session",
        unit: "m/s",
        formatValue: (value) => value.toFixed(2),
      };
    case "short_distance_weight":
      return { category: "heaviest_weight", title: "Best weight per session", unit: "kg" };
    case "floors_duration":
      return {
        category: "best_floors_per_minute",
        title: "Floors per minute per session",
        unit: "/min",
        formatValue: (value) => value.toFixed(1),
      };
    case "steps_duration":
      return {
        category: "best_steps_per_minute",
        title: "Steps per minute per session",
        unit: "/min",
        formatValue: (value) => value.toFixed(1),
      };
  }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** Range links, so a different window is one click and needs no client state. */
function RangeLinks({ exerciseId, range }: { exerciseId: string; range: ProgressRange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROGRESS_RANGES.map((option) => {
        const isActive = option === range;
        return (
          <Link
            key={option}
            href={`/exercises/${exerciseId}?tab=statistics&range=${option}`}
            aria-current={isActive ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              isActive
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {RANGE_LABELS[option]}
          </Link>
        );
      })}
    </div>
  );
}

function PersonalRecords({
  stats,
  timeZone,
}: {
  stats: ExerciseStatistics;
  timeZone: string;
}) {
  if (stats.personalRecords.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-zinc-500">
        Personal records <span className="font-normal text-zinc-400">· all time</span>
      </h2>
      <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
        {stats.personalRecords.map((record) => (
          <li key={record.category} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="text-xs text-zinc-500">{RECORD_CATEGORY_LABELS[record.category]}</span>
            <span className="text-sm font-semibold">
              {formatCategoryValue(record.category, record.value)}
            </span>
            <span className="ml-auto text-xs text-zinc-400">
              {formatDateTimeInTimeZone(record.achievedAt, timeZone)}
            </span>
            <Link
              href={`/workouts/${record.workoutId}`}
              className="max-w-full truncate text-xs text-zinc-500 underline"
            >
              {record.workoutTitle}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * `range` is threaded from the page's `?range=` search param (to `progressQuerySchema`'s
 * vocabulary) and defaults to all time, which is the useful view for a single
 * exercise: its history is short enough that narrowing the window would hide the
 * shape of the progression rather than help. It is optional so the page cannot
 * fail to render if the param is not wired; the links still resolve.
 */
export async function ExerciseStats({
  userId,
  exerciseId,
  exerciseTitle,
  range = "all",
  timeZone,
}: {
  userId: string;
  exerciseId: string;
  exerciseTitle: string;
  range?: ProgressRange;
  timeZone: string;
}) {
  const exercise = await getVisibleExercise(db, exerciseId, userId);
  // The page already resolved visibility; this is the defensive path for a
  // directly-rendered panel, and it is what supplies the exercise's type.
  if (!exercise) return null;

  const stats = await getExerciseStatistics(db, userId, exercise, range, timeZone);

  // Never completed: there is no honest number to show, so show a sentence
  // instead of a grid of zeroes and a flat chart. This is judged on ALL time,
  // not the selected range — a narrow window with no sets is a different state,
  // handled below.
  if (stats.allTimeCompletedSets === 0) {
    return <p className="text-zinc-500">No workout history yet. Complete a set of {exerciseTitle} to see statistics here.</p>;
  }

  const summary = SUMMARY_BY_TYPE[exercise.exercise_type];
  const chart = chartSpecFor(exercise.exercise_type, exercise.duration_record_direction);
  const chartPoints = stats.sessions.flatMap((session) => {
    const value = session.bests[chart.category];
    return value === undefined
      ? []
      : [{ label: formatDateTimeInTimeZone(session.startedAt, timeZone), value }];
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeLinks exerciseId={exerciseId} range={range} />
      </div>

      {stats.totals.completedSets === 0 ? (
        <p className="mt-6 text-zinc-500">
          No completed sets for {exerciseTitle} in {RANGE_LABELS[range]}.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {summary.map((metric) => {
            const value = summaryValue(metric, stats.totals);
            return (
              <Stat
                key={metric.kind === "category" ? metric.category : metric.kind}
                label={summaryLabel(metric)}
                value={value == null ? "—" : formatSummaryValue(metric, value)}
                note={summaryNote(metric)}
              />
            );
          })}
        </div>
      )}

      {stats.totals.completedSets > 0 && chartPoints.length > 0 ? (
        <ProgressChart
          title={`${chart.title} · ${RANGE_LABELS[range]}`}
          unit={chart.unit}
          points={chartPoints}
          formatValue={chart.formatValue}
        />
      ) : null}

      {/* Records are all-time by definition, so this section is not filtered by
          the range control above. */}
      <PersonalRecords stats={stats} timeZone={timeZone} />
    </>
  );
}
