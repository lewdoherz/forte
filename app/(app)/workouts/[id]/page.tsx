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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/workouts" className="text-sm text-zinc-500 underline">
        ← Workouts
      </Link>

      <div className="mt-3 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{workout.title}</h1>
        {active ? (
          <ElapsedTimer startedAt={workout.started_at.toISOString()} endedAt={null} />
        ) : (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Completed · {formatDuration(stats.durationSeconds)}
          </span>
        )}
      </div>

      <div className="mt-2 text-sm text-zinc-500">
        {formatDateTime(workout.started_at)}
        {workout.ended_at ? ` → ${formatDateTime(workout.ended_at)}` : ""}
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

      {active ? (
        <form action={finishWorkoutFormAction} className="mt-4">
          <input type="hidden" name="workoutId" value={workout.id} />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Finish workout
          </button>
        </form>
      ) : null}

      <ol className="mt-6 space-y-4">
        {workout.exercises.map((ex) => (
          <li key={ex.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{ex.template.title}</span>
              <span className="text-sm text-zinc-500">
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
                    className={`rounded-md border p-2 ${done ? "border-green-300 bg-green-50" : "border-zinc-200"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-zinc-500">
                        {SET_TYPE_LABELS[s.set_type]}
                      </span>

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

                      {active ? (
                        <div className="ml-auto flex items-center gap-1">
                          {done ? (
                            <form action={uncompleteSetFormAction}>
                              <input type="hidden" name="workoutId" value={workout.id} />
                              <input type="hidden" name="setId" value={s.id} />
                              <button type="submit" className="text-xs text-zinc-600 underline">
                                Undo
                              </button>
                            </form>
                          ) : null}
                          <form action={removeSetFormAction}>
                            <input type="hidden" name="workoutId" value={workout.id} />
                            <input type="hidden" name="setId" value={s.id} />
                            <button type="submit" className="px-1 text-xs text-red-600">
                              ✕
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {active ? (
                <form action={addSetFormAction}>
                  <input type="hidden" name="workoutId" value={workout.id} />
                  <input type="hidden" name="workoutExerciseId" value={ex.id} />
                  <button type="submit" className="text-xs text-zinc-600 underline">
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
