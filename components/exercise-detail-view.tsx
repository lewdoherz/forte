"use client";

import { useMemo, useState } from "react";
import type { OfflineCatalogExercise, OfflineVocabularyEntry } from "@/lib/offline-store";
import type { LoggedWorkout } from "@/lib/workout-sync";
import { BodyHeatmap } from "@/components/body-heatmap";
import { ClientProgressChart } from "@/components/client-progress-chart";
import { ExerciseThumbnail, ExerciseVideo } from "@/components/exercise-media";
import { exerciseTypeLabel } from "@/lib/exercise-types";
import {
  computeLocalExerciseHistory,
  computeLocalExerciseStats,
} from "@/lib/local-analytics";
import { PROGRESS_RANGES, rangeLabel, type ProgressRange } from "@/lib/progress";
import { recordCategoryLabel, type RecordCategory } from "@/lib/records";
import { formatSetValues } from "@/lib/workout-stats";
import { formatDateTime, formatDayAndMonth, formatDuration, formatNumber } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n";

type DetailTab = "how-to" | "statistics" | "history";

function splitNumberedSteps(howTo: string | null): string[] | null {
  if (!howTo) return null;
  const lines = howTo
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || !lines.every((line) => /^\d+[.)]\s+\S/.test(line))) return null;
  return lines.map((line) => line.replace(/^\d+[.)]\s+/, ""));
}

function formatRecordMetric(
  category: RecordCategory,
  value: number,
  locale: Locale,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (category) {
    case "heaviest_weight":
    case "heaviest_added_weight":
    case "lowest_assistance":
    case "best_e1rm":
      return t("common.quantity", { value: formatNumber(locale, Math.round(value * 10) / 10), unit: t("common.unit.kg") });
    case "best_set_volume":
      return t("common.quantity", { value: formatNumber(locale, Math.round(value)), unit: t("common.unit.kg") });
    case "most_reps":
      return t("common.plural.reps", { count: Math.round(value) });
    case "best_duration":
    case "longest_duration":
      return formatDuration(locale, Math.round(value));
    case "longest_distance":
      return t("common.quantity", { value: formatNumber(locale, Math.round(value)), unit: t("common.unit.m") });
    case "best_pace":
      return `${formatNumber(locale, Math.round(value * 100) / 100)} m/s`;
    case "most_floors":
      return formatNumber(locale, Math.round(value));
    case "best_floors_per_minute":
      return `${formatNumber(locale, Math.round(value * 10) / 10)}/min`;
    case "most_steps":
      return formatNumber(locale, Math.round(value));
    case "best_steps_per_minute":
      return `${formatNumber(locale, Math.round(value * 10) / 10)}/min`;
  }
}

function primaryChartForExercise(
  stats: ReturnType<typeof computeLocalExerciseStats>,
  exerciseType: OfflineCatalogExercise["exercise_type"],
  locale: Locale,
  timeZone: string,
  t: ReturnType<typeof useI18n>["t"],
): Array<{ title: string; unit: string; points: { label: string; value: number }[] }> {
  const charts: Array<{ title: string; unit: string; points: { label: string; value: number }[] }> = [];
  const labelFor = (d: Date) => formatDayAndMonth(locale, d, timeZone);

  if (exerciseType === "weight_reps" || exerciseType === "bodyweight_weighted") {
    const heaviest = stats.sessions
      .map((s) => ({
        label: labelFor(s.startedAt),
        value: s.bests.heaviest_weight ?? s.bests.heaviest_added_weight,
      }))
      .filter((p): p is { label: string; value: number } => p.value !== undefined);
    if (heaviest.length > 0) {
      charts.push({
        title: recordCategoryLabel(
          exerciseType === "weight_reps" ? "heaviest_weight" : "heaviest_added_weight",
          locale,
        ),
        unit: t("common.unit.kg"),
        points: heaviest,
      });
    }
    const e1rm = stats.sessions
      .map((s) => ({ label: labelFor(s.startedAt), value: s.bests.best_e1rm }))
      .filter((p): p is { label: string; value: number } => p.value !== undefined);
    if (e1rm.length > 0) {
      charts.push({
        title: recordCategoryLabel("best_e1rm", locale),
        unit: t("common.unit.kg"),
        points: e1rm,
      });
    }
    const vol = stats.sessions
      .filter((s) => s.volumeKg > 0)
      .map((s) => ({ label: labelFor(s.startedAt), value: Math.round(s.volumeKg) }));
    if (vol.length > 0) {
      charts.push({
        title: t("dashboard.metric.volume"),
        unit: t("common.unit.kg"),
        points: vol,
      });
    }
  } else if (exerciseType === "duration" || exerciseType === "weight_duration") {
    const dur = stats.sessions
      .map((s) => ({
        label: labelFor(s.startedAt),
        value: s.bests.best_duration ?? s.bests.longest_duration,
      }))
      .filter((p): p is { label: string; value: number } => p.value !== undefined);
    if (dur.length > 0) {
      charts.push({
        title: recordCategoryLabel("best_duration", locale),
        unit: t("common.unit.seconds"),
        points: dur,
      });
    }
  } else {
    const reps = stats.sessions
      .map((s) => ({ label: labelFor(s.startedAt), value: s.bests.most_reps }))
      .filter((p): p is { label: string; value: number } => p.value !== undefined);
    if (reps.length > 0) {
      charts.push({
        title: recordCategoryLabel("most_reps", locale),
        unit: t("common.unit.reps"),
        points: reps,
      });
    }
  }
  return charts;
}

export function ExerciseDetailView({
  exercise,
  muscles,
  equipment,
  workouts = [],
  timeZone = "UTC",
  initialTab = "how-to",
  backLabel,
  onBack,
  onOpenWorkout,
  compact = false,
}: {
  exercise: OfflineCatalogExercise;
  muscles: OfflineVocabularyEntry[];
  equipment: OfflineVocabularyEntry[];
  workouts?: LoggedWorkout[];
  timeZone?: string;
  initialTab?: DetailTab;
  backLabel?: string;
  onBack?: () => void;
  onOpenWorkout?: (workoutId: string) => void;
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [range, setRange] = useState<ProgressRange>("all");

  const muscleNames = useMemo(
    () => new Map(muscles.map((m) => [m.code, m.display_name])),
    [muscles],
  );
  const equipmentNames = useMemo(
    () => new Map(equipment.map((e) => [e.code, e.display_name])),
    [equipment],
  );

  const muscleValues = useMemo(() => {
    const values: Record<string, number> = { [exercise.primary_muscle]: 1 };
    for (const sec of exercise.secondary_muscles) {
      values[sec] = Math.max(values[sec] ?? 0, 0.45);
    }
    return values;
  }, [exercise.primary_muscle, exercise.secondary_muscles]);

  const secondaryLabels = exercise.secondary_muscles.map((c) => muscleNames.get(c) ?? c);
  const steps = useMemo(() => splitNumberedSteps(exercise.how_to), [exercise.how_to]);
  const stats = useMemo(
    () => computeLocalExerciseStats(workouts, exercise, range, timeZone),
    [workouts, exercise, range, timeZone],
  );
  const history = useMemo(
    () => computeLocalExerciseHistory(workouts, exercise),
    [workouts, exercise],
  );
  const charts = useMemo(
    () => primaryChartForExercise(stats, exercise.exercise_type, locale, timeZone, t),
    [stats, exercise.exercise_type, locale, timeZone, t],
  );

  const mediaIsVideo = Boolean(
    exercise.media_url && /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(exercise.media_url),
  );

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)]"
        >
          ← {backLabel ?? t("nav.exercises")}
        </button>
      ) : null}

      <header className="space-y-4">
        <div className="flex items-start gap-3.5">
          <ExerciseThumbnail slug={exercise.slug} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-xl font-semibold leading-tight">
                {exercise.title}
              </h2>
              <span className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                {t(
                  exercise.is_custom
                    ? "exerciseDetail.badge.custom"
                    : "exerciseDetail.badge.library",
                )}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {muscleNames.get(exercise.primary_muscle) ?? exercise.primary_muscle}
              {secondaryLabels.length > 0 ? ` · ${secondaryLabels.join(", ")}` : ""}
            </p>
          </div>
        </div>

        <dl className="training-panel divide-y divide-[var(--border-subtle)] rounded-2xl text-sm">
          <div className="flex justify-between gap-3 px-4 py-2.5">
            <dt className="text-[var(--text-muted)]">{t("exerciseDetail.field.primaryMuscle")}</dt>
            <dd className="text-right font-medium">
              {muscleNames.get(exercise.primary_muscle) ?? exercise.primary_muscle}
            </dd>
          </div>
          {secondaryLabels.length > 0 ? (
            <div className="flex justify-between gap-3 px-4 py-2.5">
              <dt className="text-[var(--text-muted)]">
                {t("exerciseDetail.field.secondaryMuscles")}
              </dt>
              <dd className="text-right font-medium">{secondaryLabels.join(", ")}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 px-4 py-2.5">
            <dt className="text-[var(--text-muted)]">{t("exerciseDetail.field.equipment")}</dt>
            <dd className="text-right font-medium">
              {equipmentNames.get(exercise.equipment) ?? exercise.equipment}
            </dd>
          </div>
          <div className="flex justify-between gap-3 px-4 py-2.5">
            <dt className="text-[var(--text-muted)]">{t("exerciseDetail.field.type")}</dt>
            <dd className="text-right font-medium">
              {exerciseTypeLabel(exercise.exercise_type, locale)}
            </dd>
          </div>
        </dl>
      </header>

      {/* Tabs: How To / Statistics / History */}
      <div
        role="tablist"
        className="grid grid-cols-3 gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1"
      >
        {(
          [
            { id: "how-to", label: "exerciseDetail.tabs.howTo" },
            { id: "statistics", label: "exerciseDetail.tabs.statistics" },
            { id: "history", label: "exerciseDetail.tabs.history" },
          ] as const
        ).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`min-h-11 rounded-lg px-2 text-xs font-semibold transition-colors sm:text-sm ${
                active
                  ? "training-action"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t(item.label)}
            </button>
          );
        })}
      </div>

      {tab === "how-to" ? (
        <div className="space-y-4">
          <ExerciseVideo
            slug={exercise.slug}
            mediaUrl={mediaIsVideo ? (exercise.media_url ?? null) : null}
            title={exercise.title}
          />

          <div className="training-panel rounded-2xl p-4">
            <BodyHeatmap muscleValues={muscleValues} />
          </div>

          {steps ? (
            <ol className="training-panel list-decimal space-y-2 rounded-2xl p-4 pl-9 text-sm leading-relaxed">
              {steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          ) : exercise.how_to ? (
            <p className="training-panel whitespace-pre-line rounded-2xl p-4 text-sm leading-relaxed text-[var(--text-muted)]">
              {exercise.how_to}
            </p>
          ) : (
            <div className="training-panel rounded-2xl border-dashed p-6 text-center text-sm text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text-primary)]">
                {t("exerciseDetail.howTo.empty", { exercise: exercise.title })}
              </p>
              <p className="mt-1">{t("exerciseDetail.howTo.emptyBody")}</p>
            </div>
          )}
        </div>
      ) : tab === "statistics" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {PROGRESS_RANGES.map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={range === opt}
                onClick={() => setRange(opt)}
                className={`min-h-10 rounded-xl border px-3 text-xs font-semibold ${
                  range === opt
                    ? "training-action border-transparent"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
                }`}
              >
                {rangeLabel(opt, locale)}
              </button>
            ))}
          </div>

          {stats.allTimeCompletedSets === 0 ? (
            <div className="training-panel rounded-2xl border-dashed p-6 text-center text-sm text-[var(--text-muted)]">
              {t("progress.empty")}
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-2.5">
                <div className="training-panel rounded-2xl p-3">
                  <dt className="text-[11px] text-[var(--text-muted)]">
                    {t("dashboard.metric.workouts")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {formatNumber(locale, stats.totals.sessions)}
                  </dd>
                </div>
                <div className="training-panel rounded-2xl p-3">
                  <dt className="text-[11px] text-[var(--text-muted)]">
                    {t("dashboard.metric.sets")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {formatNumber(locale, stats.totals.completedSets)}
                  </dd>
                </div>
                <div className="training-panel rounded-2xl p-3">
                  <dt className="text-[11px] text-[var(--text-muted)]">
                    {t("dashboard.metric.volume")}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {formatNumber(locale, Math.round(stats.totals.volumeKg))} {t("common.unit.kg")}
                  </dd>
                </div>
              </dl>

              {stats.personalRecords.length > 0 ? (
                <section className="training-panel rounded-2xl p-4">
                  <h3 className="text-sm font-semibold">{t("dashboard.records.title")}</h3>
                  <ul className="mt-2 divide-y divide-[var(--border-subtle)]">
                    {stats.personalRecords.map((pr) => (
                      <li key={pr.category} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--accent-text)]">
                            {recordCategoryLabel(pr.category, locale)}
                          </p>
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {formatDateTime(locale, pr.achievedAt, timeZone)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {formatRecordMetric(pr.category, pr.value, locale, t)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {charts.map((chart) => (
                <ClientProgressChart
                  key={chart.title}
                  title={chart.title}
                  unit={chart.unit}
                  points={chart.points}
                />
              ))}
            </>
          )}
        </div>
      ) : history.length === 0 ? (
        <div className="training-panel rounded-2xl border-dashed p-6 text-center text-sm text-[var(--text-muted)]">
          {t("offline.shell.historyEmpty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {history.map((session) => (
            <li key={session.workoutId} className="training-panel rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {onOpenWorkout ? (
                  <button
                    type="button"
                    onClick={() => onOpenWorkout(session.workoutId)}
                    className="text-left text-sm font-semibold text-[var(--accent-text)] underline underline-offset-4"
                  >
                    {session.workoutTitle}
                  </button>
                ) : (
                  <h3 className="text-sm font-semibold">{session.workoutTitle}</h3>
                )}
                <span className="text-xs text-[var(--text-muted)]">
                  {formatDateTime(locale, session.startedAt, timeZone)}
                </span>
              </div>
              {session.notes ? (
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">{session.notes}</p>
              ) : null}
              <ol className="mt-2.5 divide-y divide-[var(--border-subtle)] text-sm">
                {session.sets.map((s, idx) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs font-semibold text-[var(--text-muted)]">
                      #{idx + 1}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatSetValues(s, exercise.exercise_type, locale)}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
