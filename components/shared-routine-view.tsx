import type { ExerciseType, WorkoutSet } from "@/schema/types";
import type { SharedRoutine, SharedRoutineSet } from "@/lib/share";
import { formatSetValues } from "@/lib/workout-stats";
import { ExerciseThumbnail } from "@/components/exercise-media";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { RoutineSummaryBody } from "@/components/routine-summary-panel";

const SET_TYPE_LABELS: Record<SharedRoutineSet["setType"], string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

/**
 * The heading over each exercise's value column, named for the targets its type
 * prescribes in the order they render. This is presentation only: which values
 * appear is still decided by `formatSetValues` and the `SET_FIELDS_BY_TYPE`
 * signature it follows, so a heading can never disagree with the values below
 * it.
 */
const TARGET_HEADINGS: Record<ExerciseType, string> = {
  weight_reps: "Weight & reps",
  bodyweight_reps: "Reps",
  bodyweight_weighted: "Added weight & reps",
  bodyweight_assisted: "Assistance & reps",
  reps_only: "Reps",
  duration: "Duration",
  weight_duration: "Weight & duration",
  distance_duration: "Distance & duration",
  short_distance_weight: "Distance & weight",
  floors_duration: "Floors & duration",
  steps_duration: "Steps & duration",
};

/**
 * Adapts the public target projection to the shape `formatSetValues` reads.
 *
 * The canonical formatter is typed against a finished `workout_set` row, but it
 * reads only the prescribed-target fields. A routine set has no RPE, no
 * completion and no workout identity, so those arrive as the absence they are
 * rather than being fetched — the public payload deliberately carries none of
 * them, and nothing here is rendered.
 */
function displaySet(set: SharedRoutineSet, position: number): WorkoutSet {
  return {
    id: "",
    workout_exercise_id: "",
    position,
    set_type: set.setType,
    reps: set.reps,
    weight_kg: set.weightKg,
    duration_seconds: set.durationSeconds,
    distance_meters: set.distanceMeters,
    rpe: null,
    metrics: {
      floors: set.floors ?? undefined,
      steps: set.steps ?? undefined,
    },
    completed_at: null,
    created_at: new Date(0),
    updated_at: new Date(0),
  };
}

/** "3 sets" / "1 set" — a row's prescribed set count, pluralised once. */
function setCountLabel(count: number): string {
  return `${count} ${count === 1 ? "set" : "sets"}`;
}

/**
 * A shared routine, read-only, for a viewer who holds the token and nothing
 * else.
 *
 * Pure and synchronous on purpose: it renders from the resolved payload with no
 * data access of its own, so the public route stays a thin token -> payload ->
 * view pipeline and the verification suite can render the exact markup the route
 * serves without a browser.
 *
 * Without set targets a recipient could read the routine but not follow it, so
 * each exercise shows its ordered prescription — a set number and the values
 * `formatSetValues` derives from the exercise's own type. There are no controls,
 * links or ids: the token is the whole capability, and the view is output only.
 */
export function SharedRoutineView({
  routine,
  muscles,
}: {
  routine: SharedRoutine;
  /** Muscle vocabulary, in display order; the summary table's names and order. */
  muscles: readonly VocabularyEntry[];
}) {
  // The summary is recomputed from the shared prescription through the same
  // functions the owner's page uses (`routineSummary`, `muscleDistribution`),
  // fed by the saved set types — never a second calculation. Exposing the
  // targets adds no input here: the muscle distribution still depends only on
  // the muscles and the set types.
  const summaryExercises = routine.exercises.map((exercise) => ({
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: exercise.secondaryMuscles,
    sets: exercise.setTypes.map((setType) => ({ setType })),
    restSeconds: exercise.restSeconds,
  }));

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <p className="text-sm text-zinc-500">Shared routine</p>
          <h1 className="mt-4 break-words text-2xl font-semibold">{routine.title}</h1>
          {routine.notes ? <p className="mt-3 text-sm text-zinc-600">{routine.notes}</p> : null}

          {routine.exercises.length === 0 ? (
            <p className="mt-8 text-zinc-500">This routine has no exercises yet.</p>
          ) : (
            // Order is `routine_exercise.position`, preserved by the resolve query.
            <ol className="mt-6 space-y-3">
              {routine.exercises.map((exercise, exerciseIndex) => (
                <li
                  // Index key: the payload carries no exercise id (an id would
                  // be serialised into the page's inlined React data even as a
                  // key), and this list is rendered once in a fixed order.
                  key={exerciseIndex}
                  className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <ExerciseThumbnail slug={exercise.slug} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{exercise.title}</span>
                      {exercise.supersetKey ? (
                        <span className="mt-1 inline-block rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                          Superset
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm text-zinc-500">
                      {setCountLabel(exercise.sets.length)}
                    </span>
                  </div>

                  {exercise.sets.length === 0 ? (
                    <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-500">
                      No sets prescribed.
                    </p>
                  ) : (
                    <div className="mt-3 border-t border-zinc-100 pt-3">
                      <div className="flex items-baseline gap-3 text-xs text-zinc-500">
                        <span className="w-5 shrink-0 text-right">Set</span>
                        <span>{TARGET_HEADINGS[exercise.exerciseType]}</span>
                      </div>
                      <ol className="mt-1.5 space-y-1.5">
                        {exercise.sets.map((set, index) => (
                          <li
                            key={index}
                            className="flex items-baseline gap-3 text-sm"
                          >
                            <span className="w-5 shrink-0 text-right tabular-nums text-zinc-400">
                              {index + 1}.
                            </span>
                            <span className="min-w-0 text-zinc-800">
                              {formatSetValues(displaySet(set, index), exercise.exerciseType)}
                            </span>
                            {set.setType === "normal" ? null : (
                              <span className="shrink-0 text-xs text-zinc-500">
                                {SET_TYPE_LABELS[set.setType]}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">
              Shared by <span className="text-zinc-700">{routine.ownerName ?? "a Forte user"}</span>
            </p>
            <p className="mt-3 text-sm text-zinc-500">
              This is a read-only view of someone else&rsquo;s routine. Nothing here can be edited.
            </p>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Routine summary</h2>
            <RoutineSummaryBody exercises={summaryExercises} muscles={muscles} />
          </section>
        </aside>
      </div>
    </main>
  );
}
