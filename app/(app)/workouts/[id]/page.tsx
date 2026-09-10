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
import { RestTimer } from "@/components/rest-timer";
import { SetForm } from "@/components/set-form";
import { formatDuration } from "@/lib/format";
import { DEFAULT_TIME_ZONE, formatDateTimeInTimeZone } from "@/lib/timezone";
import { getUserProfile } from "@/lib/users";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

const EXERCISE_CARD = "rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4";

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

  const [{ muscles }, profile] = await Promise.all([getVocabularies(db), getUserProfile(db, userId)]);
  // The owner's zone, so times read the same here as on the history list.
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;
  const muscleNames = new Map(muscles.map((m) => [m.code, m.display_name]));
  const active = workout.ended_at == null;
  const stats = summarizeWorkout(workout);

  // Bound to a local so the render helper below closes over a narrowed value:
  // TypeScript cannot keep the `notFound()` narrowing inside a nested function.
  const exercises = workout.exercises;

  // The rest countdown is anchored to the most recently completed set and the
  // rest target that set's own exercise was started with. Both are read from the
  // snapshot, never from the routine, so an edit to the routine cannot change a
  // workout already under way.
  let restAnchor: Date | null = null;
  let restSeconds: number | null = null;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed_at && (restAnchor === null || set.completed_at.getTime() > restAnchor.getTime())) {
        restAnchor = set.completed_at;
        restSeconds = ex.rest_seconds;
      }
    }
  }

  // Consecutive exercises sharing a superset key are performed together, so they
  // are rendered as one unit. Keys are only stored when shared (normalised on
  // save), so a keyed group of one cannot occur.
  const groups: { key: string | null; exercises: typeof exercises }[] = [];
  for (const ex of exercises) {
    const previous = groups.at(-1);
    if (ex.superset_key !== null && previous && previous.key === ex.superset_key) {
      previous.exercises.push(ex);
    } else {
      groups.push({ key: ex.superset_key, exercises: [ex] });
    }
  }

  function renderExercise(ex: (typeof exercises)[number]) {
    return (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 break-words font-medium">{ex.template.title}</span>
          <span className="shrink-0 text-sm text-zinc-500">
            {muscleNames.get(ex.template.primary_muscle) ?? ex.template.primary_muscle}
          </span>
        </div>
        {ex.rest_seconds != null ? (
          <div className="mt-0.5 text-xs text-zinc-400">Rest {ex.rest_seconds}s</div>
        ) : null}
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
                          <input type="hidden" name="workoutId" value={id} />
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
                        <input type="hidden" name="workoutId" value={id} />
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
                      workoutId={id}
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
              <input type="hidden" name="workoutId" value={id} />
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
      </>
    );
  }

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
            <span className="hidden shrink-0 text-sm font-medium tabular-nums text-zinc-700 sm:inline">
              <ElapsedTimer startedAt={workout.started_at.toISOString()} endedAt={null} />
            </span>
          ) : null}
          <RestTimer
            workoutId={id}
            anchor={restAnchor ? restAnchor.toISOString() : null}
            restSeconds={restSeconds}
            workoutActive={active}
          />
          {active ? (
            <form action={finishWorkoutFormAction} className="shrink-0">
              <input type="hidden" name="workoutId" value={id} />
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
        <span>{formatDateTimeInTimeZone(workout.started_at, timeZone)}</span>
        {workout.ended_at ? (
          <span>→ {formatDateTimeInTimeZone(workout.ended_at, timeZone)}</span>
        ) : null}
        {!active ? (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Completed · {formatDuration(stats.durationSeconds)}
          </span>
        ) : null}
        {active ? (
          <span className="tabular-nums sm:hidden">
            <ElapsedTimer startedAt={workout.started_at.toISOString()} endedAt={null} />
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
        {groups.map((group) => {
          const isSuperset = group.key !== null && group.exercises.length > 1;

          if (!isSuperset) {
            return (
              <li key={group.exercises[0].id} className={EXERCISE_CARD}>
                {renderExercise(group.exercises[0])}
              </li>
            );
          }

          return (
            <li
              key={group.exercises[0].id}
              className="rounded-xl border border-sky-200 bg-sky-50/60 p-2 sm:p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-2">
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
                  Superset
                </span>
                <span className="text-xs text-sky-800">
                  Alternate between these, then rest
                </span>
              </div>
              <div className="space-y-3">
                {group.exercises.map((ex) => (
                  <div key={ex.id} className={EXERCISE_CARD}>
                    {renderExercise(ex)}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
