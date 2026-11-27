import Link from "next/link";
import type { SetType, WorkoutTree } from "@/schema/types";
import { ExerciseThumbnail } from "@/components/exercise-media";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { WorkoutSummary } from "@/components/workout-summary";
import { formatDuration, formatDateTime, formatNumber } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n";
import { recordCategoryLabel } from "@/lib/records";
import type { EarnedRecord } from "@/lib/records-history";
import { formatSetValues, formatVolumeKg, summarizeWorkout } from "@/lib/workout-stats";

/** The dictionary key for each set type's badge; keyed, not a bare map, so a
 * new set type cannot be added without its wording. */
const SET_TYPE_KEYS: Record<SetType, MessageKey> = {
  warmup: "workouts.setType.warmup",
  normal: "workouts.setType.normal",
  failure: "workouts.setType.failure",
  dropset: "workouts.setType.dropset",
};

/**
 * A completed workout, read-only.
 *
 * This is the historical record — the workout's own rows, never the routine it
 * came from. `getWorkoutTree` already resolves exercises and sets from the
 * workout tables (only the exercise's catalogue entry is read live by
 * `template_id`, which is existing behaviour), so editing the source routine
 * cannot change anything rendered here.
 *
 * The metrics come from `summarizeWorkout`: the same volume the history card
 * shows. Every set is rendered through `formatSetValues`, which follows the
 * exercise's own type rather than assuming weight × reps.
 */
export async function WorkoutDetail({
  workout,
  timeZone,
  muscles,
  records,
}: {
  workout: WorkoutTree;
  /** The owner's zone, so the performed date reads consistently with the history list. */
  timeZone: string;
  /** Muscle vocabulary, in display order; the distribution table's names and order. */
  muscles: readonly VocabularyEntry[];
  /**
   * Records this workout earned, already ordered by the workout's exercise
   * order then canonical category order. Read by the page from the derived
   * history; never stored on the workout.
   */
  records: readonly EarnedRecord[];
}) {
  const { locale, t } = await getI18n();
  const stats = summarizeWorkout(workout);

  // Grouped by template because a record belongs to the exercise, not to a
  // particular set: the baseline module already collapses a workout's best
  // candidates to one (exercise, category) pair, and the badge list below is
  // rendered once per exercise rather than once per set.
  const recordsByTemplate = new Map<string, EarnedRecord[]>();
  for (const record of records) {
    const earned = recordsByTemplate.get(record.templateId);
    if (earned) earned.push(record);
    else recordsByTemplate.set(record.templateId, [record]);
  }

  // Only exercises actually performed appear: an exercise whose sets were all
  // skipped is part of the plan, not of the record. The finish `.map` then
  // attaches records by template; a template repeated in one workout shows its
  // badges on its first performed block only, so the same record is never
  // counted twice on the page.
  const seenTemplates = new Set<string>();
  const exercises = workout.exercises
    .map((exercise) => ({
      exercise,
      sets: exercise.sets.filter((set) => set.completed_at != null),
    }))
    .filter((entry) => entry.sets.length > 0)
    .map((entry) => {
      const earned = seenTemplates.has(entry.exercise.template_id)
        ? []
        : (recordsByTemplate.get(entry.exercise.template_id) ?? []);
      seenTemplates.add(entry.exercise.template_id);
      return { ...entry, earned };
    });
  const hasVolume = exercises.some(({ exercise, sets }) =>
    (exercise.template.exercise_type === "weight_reps" ||
      exercise.template.exercise_type === "bodyweight_weighted" ||
      exercise.template.exercise_type === "bodyweight_assisted") &&
    sets.some((set) => set.reps != null && set.weight_kg != null),
  );

  // The same shape the routine summary feeds to `muscleDistribution`, but built
  // from this workout's COMPLETED sets — never from a routine's prescription.
  // `muscleDistribution` then drops warm-ups, as it does for a routine.
  const summaryExercises = exercises.map(({ exercise, sets }) => ({
    primaryMuscle: exercise.template.primary_muscle,
    secondaryMuscles: exercise.template.secondary_muscles,
    sets: sets.map((set) => ({ setType: set.set_type })),
  }));

  return (
    <main className="training mx-auto min-h-dvh w-full max-w-4xl px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
      <Link
        href="/workouts"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
      >
        <span aria-hidden="true">←</span>
        {t("workouts.detail.back")}
      </Link>

      <header className="pb-6 pt-5 sm:pb-8">
        <p className="inline-flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--accent-text)]">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="m6 10 2.5 2.5L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t("workouts.recap.saved")}</span>
          <span className="rounded-full border border-[var(--badge-border)] bg-[var(--badge-bg)] px-2 py-0.5 text-xs font-medium text-[var(--badge-text)]">
            {t("offline.badge.synced")}
          </span>
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("workouts.recap.title")}
        </h1>
        <h2 className="mt-4 break-words text-xl font-medium sm:text-2xl">{workout.title}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          <time dateTime={workout.started_at.toISOString()}>
            {formatDateTime(locale, workout.started_at, timeZone)}
          </time>
        </p>
      </header>

      <dl className={`grid gap-2 sm:gap-3 ${hasVolume ? "grid-cols-3" : "grid-cols-2"}`}>
        <div className="training-panel min-w-0 rounded-2xl p-3 sm:p-5">
          <dt className="text-xs text-[var(--text-muted)] sm:text-sm">{t("workouts.metric.duration")}</dt>
          <dd className="mt-2 break-words text-lg font-semibold tabular-nums sm:text-2xl">
            {formatDuration(locale, stats.durationSeconds)}
          </dd>
        </div>
        <div className="training-panel min-w-0 rounded-2xl p-3 sm:p-5">
          <dt className="text-xs text-[var(--text-muted)] sm:text-sm">{t("workouts.recap.completedSets")}</dt>
          <dd className="mt-2 text-lg font-semibold tabular-nums sm:text-2xl">
            {formatNumber(locale, stats.completedSets)}
          </dd>
        </div>
        {hasVolume ? (
          <div className="training-panel min-w-0 rounded-2xl p-3 sm:p-5">
            <dt className="text-xs text-[var(--text-muted)] sm:text-sm">{t("workouts.metric.volume")}</dt>
            <dd className="mt-2 break-words text-lg font-semibold tabular-nums sm:text-2xl">
              {formatVolumeKg(stats.volumeKg, locale)}
            </dd>
          </div>
        ) : null}
      </dl>

      {workout.notes ? (
        <section aria-labelledby="workout-notes" className="training-panel mt-4 rounded-2xl p-4 sm:p-5">
          <h2 id="workout-notes" className="text-sm font-medium">{t("workouts.recap.notes")}</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--text-muted)]">{workout.notes}</p>
        </section>
      ) : null}

      {exercises.length === 0 ? (
        <p className="training-panel mt-6 rounded-2xl p-5 text-sm text-[var(--text-muted)]">{t("workouts.detail.noSets")}</p>
      ) : (
        <section className="mt-8" aria-labelledby="completed-exercises">
          <h2 id="completed-exercises" className="text-lg font-semibold">{t("workouts.recap.exercises")}</h2>
          <ol className="mt-4 space-y-3">
            {exercises.map(({ exercise, sets, earned }) => (
              <li key={exercise.id} className="training-panel rounded-2xl p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <ExerciseThumbnail slug={exercise.template.slug} />
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold">
                      <Link
                        href={`/exercises/${exercise.template_id}?tab=history`}
                        className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:text-[var(--accent-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-text)]"
                      >
                        {exercise.template.title}
                        <span aria-hidden="true" className="ml-2 text-[var(--text-muted)]">↗</span>
                      </Link>
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {t("workouts.recap.setsCompleted", { count: sets.length })}
                    </p>
                  </div>
                </div>

                {exercise.notes ? (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[var(--text-muted)]">{exercise.notes}</p>
                ) : null}

                {earned.length > 0 ? (
                  <ul aria-label={t("workouts.recap.earnedRecords")} className="mt-3 flex flex-wrap gap-2">
                    {earned.map((record) => (
                      <li
                        key={record.category}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--badge-border)] bg-[var(--badge-bg)] px-2.5 py-1 text-xs font-medium text-[var(--badge-text)]"
                      >
                        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0">
                          <path d="M5 2h6v4a3 3 0 0 1-6 0V2Zm0 1H2v2a3 3 0 0 0 3 3m6-5h3v2a3 3 0 0 1-3 3M8 9v4m-3 1h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {recordCategoryLabel(record.category, locale)}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <ol className="mt-4 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                  {sets.map((set, index) => (
                    <li key={set.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm last:pb-0">
                      <span className="w-5 shrink-0 text-right tabular-nums text-[var(--text-muted)]">
                        {index + 1}.
                      </span>
                      <span className="min-w-0 flex-1 break-words font-medium tabular-nums">
                        {formatSetValues(set, exercise.template.exercise_type, locale)}
                      </span>
                      {set.set_type === "normal" ? null : (
                        <span className="text-xs text-[var(--text-muted)]">
                          {t(SET_TYPE_KEYS[set.set_type])}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>

          <details className="training-panel mt-6 rounded-2xl">
            <summary className="cursor-pointer rounded-2xl p-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] sm:p-5">
              {t("workouts.detail.summaryTitle")}
            </summary>
            <div className="border-t border-[var(--border-subtle)] p-4 pt-0 sm:p-5 sm:pt-0">
              <WorkoutSummary exercises={summaryExercises} muscles={muscles} />
            </div>
          </details>
        </section>
      )}

      <footer className="mt-8">
        <Link
          href="/workout"
          className="training-action inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-text)] sm:w-auto"
        >
          {t("workouts.recap.newWorkout")}
        </Link>
      </footer>
    </main>
  );
}
