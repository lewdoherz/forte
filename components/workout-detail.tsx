import Link from "next/link";
import type { SetType, WorkoutTree } from "@/schema/types";
import { ExerciseThumbnail } from "@/components/exercise-media";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { WorkoutSummary } from "@/components/workout-summary";
import { formatDuration } from "@/lib/format";
import { RECORD_CATEGORY_LABELS } from "@/lib/records";
import type { EarnedRecord } from "@/lib/records-history";
import { formatDateTimeInTimeZone } from "@/lib/timezone";
import { formatSetValues, formatVolumeKg, summarizeWorkout } from "@/lib/workout-stats";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
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
export function WorkoutDetail({
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

  // The same shape the routine summary feeds to `muscleDistribution`, but built
  // from this workout's COMPLETED sets — never from a routine's prescription.
  // `muscleDistribution` then drops warm-ups, as it does for a routine.
  const summaryExercises = exercises.map(({ exercise, sets }) => ({
    primaryMuscle: exercise.template.primary_muscle,
    secondaryMuscles: exercise.template.secondary_muscles,
    sets: sets.map((set) => ({ setType: set.set_type })),
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 pb-12 pt-6">
      <Link
        href="/workouts"
        aria-label="Back to workouts"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-lg text-zinc-600 hover:bg-zinc-200/60"
      >
        ←
      </Link>

      <h1 className="mt-2 break-words text-2xl font-semibold">{workout.title}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {formatDateTimeInTimeZone(workout.started_at, timeZone)}
      </p>

      <dl className="mt-4 flex flex-wrap gap-3">
        <div className="rounded-lg border border-zinc-200 px-4 py-2">
          <dt className="text-xs text-zinc-500">Duration</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {formatDuration(stats.durationSeconds)}
          </dd>
        </div>
        <div className="rounded-lg border border-zinc-200 px-4 py-2">
          <dt className="text-xs text-zinc-500">Volume</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {formatVolumeKg(stats.volumeKg)}
          </dd>
        </div>
      </dl>

      {exercises.length === 0 ? (
        <p className="mt-6 text-zinc-500">No sets were completed in this workout.</p>
      ) : (
        <>
          <ol className="mt-6 space-y-4">
            {exercises.map(({ exercise, sets, earned }) => (
              <li
                key={exercise.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <ExerciseThumbnail slug={exercise.template.slug} />
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-medium">{exercise.template.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {sets.length} {sets.length === 1 ? "set" : "sets"}
                    </div>
                  </div>
                </div>

                {/* Above the sets, and one badge per category: the record was
                    earned by the exercise's best set, not by this or that set,
                    so it is not repeated down the list. The wording comes from
                    the records module, so no two views name a category
                    differently. */}
                {earned.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {earned.map((record) => (
                      <li
                        key={record.category}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                      >
                        <span aria-hidden>🏅</span>
                        {RECORD_CATEGORY_LABELS[record.category]}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <ol className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3">
                  {sets.map((set, index) => (
                    <li key={set.id} className="flex items-baseline gap-3 text-sm">
                      <span className="w-5 shrink-0 text-right tabular-nums text-zinc-400">
                        {index + 1}.
                      </span>
                      <span className="min-w-0 text-zinc-800">
                        {formatSetValues(set, exercise.template.exercise_type)}
                      </span>
                      {set.set_type === "normal" ? null : (
                        <span className="shrink-0 text-xs text-zinc-500">
                          {SET_TYPE_LABELS[set.set_type]}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>

          {/* The record's own muscle work: same heatmap and distribution table as
              the routine summary, fed from the completed sets above. */}
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Workout summary</h2>
            <WorkoutSummary exercises={summaryExercises} muscles={muscles} />
          </section>
        </>
      )}
    </main>
  );
}
