import Link from "next/link";
import { notFound } from "next/navigation";
import type { SetType, WorkoutSet } from "@/schema/types";
import { db } from "@/lib/db";
import { getWorkoutTree, summarizeWorkout } from "@/lib/workouts";
import { getVocabularies } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import {
  addSetFormAction,
  finishWorkoutFormAction,
  removeSetFormAction,
  uncompleteSetFormAction,
} from "@/lib/workout-actions";
import { ElapsedTimer } from "@/components/elapsed-timer";
import { SetForm } from "@/components/set-form";
import { formatDateTime, formatDuration } from "@/lib/format";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

function SetValues({ set }: { set: WorkoutSet }) {
  const parts: string[] = [];
  if (set.reps != null) parts.push(`${set.reps} reps`);
  if (set.weight_kg) parts.push(`${set.weight_kg} kg`);
  if (set.duration_seconds != null) parts.push(`${set.duration_seconds}s`);
  if (set.distance_meters != null) parts.push(`${set.distance_meters} m`);
  if (set.rpe) parts.push(`RPE ${set.rpe}`);
  return <>{parts.length > 0 ? parts.join(" · ") : "—"}</>;
}

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const workout = await getWorkoutTree(db, id, userId);
  if (!workout) notFound();

  const { muscles } = await getVocabularies(db);
  const muscleNames = new Map(muscles.map((m) => [m.code, m.display_name]));
  const active = workout.ended_at == null;
  const stats = summarizeWorkout(workout);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-8">
      {/* Sticky so the timer and finish action stay reachable while logging. */}
      <div className="sticky top-0 z-30 -mx-4 border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/workouts"
            aria-label="Back to workouts"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg text-zinc-600 hover:bg-zinc-200/60"
          >
            ←
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-xl">
            {workout.title}
          </h1>
          {active ? (
            <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-700">
              <ElapsedTimer startedAt={workout.started_at.toISOString()} endedAt={null} />
            </span>
          ) : null}
          {active ? (
            <form action={finishWorkoutFormAction} className="shrink-0">
              <input type="hidden" name="workoutId" value={workout.id} />
              <button
                type="submit"
                className="h-10 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white"
              >
                Finish
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-500">
        <span>{formatDateTime(workout.started_at)}</span>
        {workout.ended_at ? <span>→ {formatDateTime(workout.ended_at)}</span> : null}
        {!active ? (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Completed · {formatDuration(stats.durationSeconds)}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
        <span>
          {stats.exerciseCount} {stats.exerciseCount === 1 ? "exercise" : "exercises"}
        </span>
        <span>
          {stats.completedSets}/{stats.totalSets} sets
        </span>
        {stats.volumeKg > 0 ? (
          <span>{Math.round(stats.volumeKg).toLocaleString()} kg volume</span>
        ) : null}
      </div>

      <ol className="mt-6 space-y-4">
        {workout.exercises.map((ex) => (
          <li
            key={ex.id}
            className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words font-medium">{ex.template.title}</span>
              <span className="shrink-0 text-sm text-zinc-500">
                {muscleNames.get(ex.template.primary_muscle) ?? ex.template.primary_muscle}
              </span>
            </div>
            {ex.notes ? <div className="mt-1 text-sm text-zinc-600">{ex.notes}</div> : null}

            <div className="mt-3 space-y-2">
              {ex.sets.map((s) => {
                const done = s.completed_at != null;
                return (
                  <div
                    key={s.id}
                    className={`rounded-md border p-2 ${
                      done ? "border-green-300 bg-green-50" : "border-zinc-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-zinc-500">
                        {SET_TYPE_LABELS[s.set_type]}
                      </span>

                      {active ? (
                        <div className="flex shrink-0 items-center gap-1">
                          {done ? (
                            <form action={uncompleteSetFormAction}>
                              <input type="hidden" name="workoutId" value={workout.id} />
                              <input type="hidden" name="setId" value={s.id} />
                              <button
                                type="submit"
                                aria-label="Undo set completion"
                                className="flex h-10 min-w-10 items-center justify-center rounded-md text-base text-zinc-600 hover:bg-zinc-200/60"
                              >
                                ↺
                              </button>
                            </form>
                          ) : null}
                          <form action={removeSetFormAction}>
                            <input type="hidden" name="workoutId" value={workout.id} />
                            <input type="hidden" name="setId" value={s.id} />
                            <button
                              type="submit"
                              aria-label="Remove set"
                              className="flex h-10 min-w-10 items-center justify-center rounded-md text-sm text-red-600 hover:bg-red-50"
                            >
                              ✕
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-1">
                      {!active || done ? (
                        <span className="text-sm text-zinc-700">
                          <SetValues set={s} />
                          {done ? <span className="ml-1 text-green-600">✓</span> : null}
                        </span>
                      ) : (
                        <SetForm
                          workoutId={workout.id}
                          setId={s.id}
                          reps={s.reps}
                          weight={s.weight_kg}
                          rpe={s.rpe}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {active ? (
                <form action={addSetFormAction}>
                  <input type="hidden" name="workoutId" value={workout.id} />
                  <input type="hidden" name="workoutExerciseId" value={ex.id} />
                  <button
                    type="submit"
                    className="h-10 rounded-md border border-dashed border-zinc-300 px-3 text-sm text-zinc-600 hover:bg-zinc-50"
                  >
                    + Add set
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
