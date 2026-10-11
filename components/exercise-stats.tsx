import Link from "next/link";
import type { DurationRecordDirection, ExerciseTemplate, ExerciseType } from "@/schema/types";
import { db } from "@/lib/db";
import {
  getExerciseStatistics,
  type ExerciseRangeTotals,
  type ExerciseStatistics,
} from "@/lib/exercise-statistics";
import { PROGRESS_RANGES, rangeLabel, type ProgressRange } from "@/lib/progress";
import { recordCategoryLabel, type RecordCategory } from "@/lib/records";
import { formatVolumeKg } from "@/lib/workout-stats";
import { ProgressChart } from "@/components/progress-chart";
import { formatDateTime, formatDecimal, formatNumber } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import type { Locale, Translate } from "@/lib/i18n";

/**
 * One exercise's canonical statistics view.
 *
 * Every number comes from completed sets in finished workouts. The query shares
 * the Records engine's guards (`PERF_COLUMNS`) and comparison
 * (`bestRecordCandidates`), so summary values, chart points, and personal
 * records agree by construction. Presentation is exercise-type-specific: a
 * distance run has no best weight, and a step machine has no best reps.
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

/** Canonical seconds, shown as a clock once the value passes a minute. */
function formatSeconds(t: Translate, total: number): string {
  const rounded = Math.round(total);
  if (rounded < 60) {
    // Tight join: English writes "45s", not "45 s".
    return t("common.quantityTight", { value: rounded, unit: t("common.unit.seconds") });
  }
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

/**
 * One category's value in its own canonical unit. The switch is over categories,
 * not exercise types, so two types that share a category (a heaviest weight is a
 * heaviest weight) format identically. It is display only — the value itself
 * stays canonical, which is what the verification asserts.
 *
 * Numbers and their unit are joined through the shared `common.quantity`
 * template and the shared unit vocabulary rather than concatenated, so a locale
 * whose convention differs (no space between value and unit) still reads right.
 */
function formatCategoryValue(
  t: Translate,
  locale: Locale,
  category: RecordCategory,
  value: number,
): string {
  const quantity = (formatted: string, unit: string) =>
    t("common.quantity", { value: formatted, unit });
  switch (category) {
    case "heaviest_weight":
    case "heaviest_added_weight":
    case "lowest_assistance":
      return quantity(formatDecimal(locale, value), t("common.unit.kg"));
    case "best_e1rm":
    case "best_set_volume":
      // Estimates and set volumes are whole kilograms; a fractional part would
      // imply precision the Epley estimate does not have.
      return quantity(formatNumber(locale, value), t("common.unit.kg"));
    case "most_reps":
      return t("common.plural.reps", { count: value });
    case "best_duration":
    case "longest_duration":
      return formatSeconds(t, value);
    case "longest_distance":
      return quantity(formatDecimal(locale, value), t("common.unit.m"));
    case "best_pace":
      return quantity(value.toFixed(2), t("exerciseDetail.unit.metersPerSecond"));
    case "most_floors":
      return t("metrics.plural.floors", { count: value });
    case "best_floors_per_minute":
      return quantity(value.toFixed(1), t("exerciseDetail.unit.floorsPerMinute"));
    case "most_steps":
      return t("metrics.plural.steps", { count: value });
    case "best_steps_per_minute":
      return quantity(value.toFixed(1), t("exerciseDetail.unit.stepsPerMinute"));
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

function summaryLabel(t: Translate, locale: Locale, metric: SummaryMetric): string {
  switch (metric.kind) {
    // The category's wording comes from the Records vocabulary, so a tile and a
    // record badge never word the same metric differently.
    case "category":
      return recordCategoryLabel(metric.category, locale);
    case "volume":
      return t("exerciseDetail.stats.summary.volume");
    case "reps":
      return t("exerciseDetail.stats.summary.reps");
    case "sessions":
      return t("exerciseDetail.stats.summary.sessions");
    case "sets":
      return t("exerciseDetail.stats.summary.sets");
  }
}

function formatSummaryValue(
  t: Translate,
  locale: Locale,
  metric: SummaryMetric,
  value: number,
): string {
  if (metric.kind === "category") return formatCategoryValue(t, locale, metric.category, value);
  if (metric.kind === "volume") return formatVolumeKg(value, locale);
  if (metric.kind === "reps") return t("common.plural.reps", { count: value });
  return String(value);
}

/** The one estimate on the page, and the policy that makes it a record. */
function summaryNote(t: Translate, metric: SummaryMetric): string | undefined {
  return metric.kind === "category" && metric.category === "best_e1rm"
    ? t("exerciseDetail.stats.e1rmNote")
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
 * The useful progression metric for each exercise type. The values use the
 * Records engine's canonical policy, including the 12-rep estimated-1RM cap and
 * the one-rep special case.
 */
function chartSpecFor(
  t: Translate,
  exerciseType: ExerciseType,
  direction: DurationRecordDirection,
): ChartSpec {
  switch (exerciseType) {
    case "weight_reps":
      return {
        category: "best_e1rm",
        title: t("exerciseDetail.chart.e1rm"),
        unit: t("common.unit.kg"),
      };
    case "bodyweight_reps":
      return {
        category: "most_reps",
        title: t("exerciseDetail.chart.reps"),
        unit: t("common.unit.reps"),
      };
    case "bodyweight_weighted":
      return {
        category: "heaviest_added_weight",
        title: t("exerciseDetail.chart.addedWeight"),
        unit: t("common.unit.kg"),
      };
    case "bodyweight_assisted":
      return {
        category: "lowest_assistance",
        title: t("exerciseDetail.chart.assistance"),
        unit: t("common.unit.kg"),
      };
    case "reps_only":
      return {
        category: "most_reps",
        title: t("exerciseDetail.chart.reps"),
        unit: t("common.unit.reps"),
      };
    case "duration":
      return {
        category: "best_duration",
        title:
          direction === "lower"
            ? t("exerciseDetail.chart.fastest")
            : direction === "none"
              ? t("exerciseDetail.chart.duration")
              : t("exerciseDetail.chart.longestHold"),
        unit: t("common.unit.seconds"),
      };
    case "weight_duration":
      return {
        category: "heaviest_weight",
        title: t("exerciseDetail.chart.weight"),
        unit: t("common.unit.kg"),
      };
    case "distance_duration":
      return {
        category: "best_pace",
        title: t("exerciseDetail.chart.pace"),
        unit: t("exerciseDetail.unit.metersPerSecond"),
        formatValue: (value) => value.toFixed(2),
      };
    case "short_distance_weight":
      return {
        category: "heaviest_weight",
        title: t("exerciseDetail.chart.weight"),
        unit: t("common.unit.kg"),
      };
    case "floors_duration":
      return {
        category: "best_floors_per_minute",
        title: t("exerciseDetail.chart.floorsPerMinute"),
        unit: t("exerciseDetail.unit.perMinute"),
        formatValue: (value) => value.toFixed(1),
      };
    case "steps_duration":
      return {
        category: "best_steps_per_minute",
        title: t("exerciseDetail.chart.stepsPerMinute"),
        unit: t("exerciseDetail.unit.perMinute"),
        formatValue: (value) => value.toFixed(1),
      };
  }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** Range links, so a different window is one click and needs no client state. */
function RangeLinks({
  exerciseId,
  range,
  locale,
}: {
  exerciseId: string;
  range: ProgressRange;
  locale: Locale;
}) {
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
            {rangeLabel(option, locale)}
          </Link>
        );
      })}
    </div>
  );
}

function PersonalRecords({
  stats,
  timeZone,
  locale,
  t,
}: {
  stats: ExerciseStatistics;
  timeZone: string;
  locale: Locale;
  t: Translate;
}) {
  if (stats.personalRecords.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-zinc-500">
        {t("exerciseDetail.stats.recordsHeading")}{" "}
        <span className="font-normal text-zinc-400">
          · {t("exerciseDetail.stats.recordsAllTime")}
        </span>
      </h2>
      <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
        {stats.personalRecords.map((record) => (
          <li key={record.category} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="text-xs text-zinc-500">
              {recordCategoryLabel(record.category, locale)}
            </span>
            <span className="text-sm font-semibold">
              {formatCategoryValue(t, locale, record.category, record.value)}
            </span>
            <span className="ml-auto text-xs text-zinc-400">
              {formatDateTime(locale, record.achievedAt, timeZone)}
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
 * `range` is validated by the page against the shared progress-range
 * vocabulary and defaults to all time.
 */
export async function ExerciseStats({
  userId,
  exercise,
  range = "all",
  timeZone,
}: {
  userId: string;
  /** The visibility-checked row the page already loaded; the panel's type and
   * record direction both come from it, so it is never read twice. */
  exercise: ExerciseTemplate;
  range?: ProgressRange;
  timeZone: string;
}) {
  const { locale, t } = await getI18n();
  const stats = await getExerciseStatistics(db, userId, exercise, range, timeZone);

  // No finished performance: avoid presenting zeroes as measured results.
  if (stats.allTimeCompletedSets === 0) {
    return (
      <p className="text-zinc-500">
        {t("exerciseDetail.stats.empty", { exercise: exercise.title })}
      </p>
    );
  }

  const summary = SUMMARY_BY_TYPE[exercise.exercise_type];
  const chart = chartSpecFor(t, exercise.exercise_type, exercise.duration_record_direction);
  const chartPoints = stats.sessions.flatMap((session) => {
    const value = session.bests[chart.category];
    return value === undefined
      ? []
      : [{ label: formatDateTime(locale, session.startedAt, timeZone), value }];
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeLinks exerciseId={exercise.id} range={range} locale={locale} />
      </div>

      {stats.totals.completedSets === 0 ? (
        <p className="mt-6 text-zinc-500">
          {t("exerciseDetail.stats.emptyRange", {
            exercise: exercise.title,
            range: rangeLabel(range, locale),
          })}
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {summary.map((metric) => {
            const value = summaryValue(metric, stats.totals);
            return (
              <Stat
                key={metric.kind === "category" ? metric.category : metric.kind}
                label={summaryLabel(t, locale, metric)}
                value={value == null ? "—" : formatSummaryValue(t, locale, metric, value)}
                note={summaryNote(t, metric)}
              />
            );
          })}
        </div>
      )}

      {stats.totals.completedSets > 0 && chartPoints.length > 0 ? (
        <ProgressChart
          title={`${chart.title} · ${rangeLabel(range, locale)}`}
          unit={chart.unit}
          points={chartPoints}
          formatValue={chart.formatValue}
        />
      ) : null}

      {/* Records are all-time by definition, so this section is not filtered by
          the range control above. */}
      <PersonalRecords stats={stats} timeZone={timeZone} locale={locale} t={t} />
    </>
  );
}
