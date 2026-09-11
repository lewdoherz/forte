import Link from "next/link";
import type { SetType, WorkoutTree } from "@/schema/types";
import { ExerciseThumbnail } from "@/components/exercise-media";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { WorkoutSummary } from "@/components/workout-summary";
import { formatDuration } from "@/lib/format";
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
}: {
  workout: WorkoutTree;
  /** The owner's zone, so the performed date reads consistently with the history list. */
  timeZone: string;
  /** Muscle vocabulary, in display order; the distribution table's names and order. */
  muscles: readonly VocabularyEntry[];
}) {
  const stats = summarizeWorkout(workout);
  // Only exercises actually performed appear: an exercise whose sets were all
  // skipped is part of the plan, not of the record.
  const exercises = workout.exercises
    .map((exercise) => ({
      exercise,
      sets: exercise.sets.filter((set) => set.completed_at != null),
    }))
    .filter((entry) => entry.sets.length > 0);

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
            {exercises.map(({ exercise, sets }) => (
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
