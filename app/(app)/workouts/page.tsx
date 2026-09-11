import Link from "next/link";
import { db } from "@/lib/db";
import { listLoggedExercises, listWorkouts } from "@/lib/workouts";
import { enrichWorkoutPage } from "@/lib/workout-history";
import { getUserProfile } from "@/lib/users";
import { requireSessionUserId } from "@/lib/auth-session";
import { startEmptyWorkoutFormAction } from "@/lib/workout-actions";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import { WorkoutCard } from "@/components/workout-card";
import { WorkoutHistory } from "@/components/workout-history";

export default async function WorkoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ exercise?: string }>;
}) {
  const userId = await requireSessionUserId();
  const { exercise } = await searchParams;

  const [profile, exercises] = await Promise.all([
    getUserProfile(db, userId),
    listLoggedExercises(db, userId),
  ]);

  // Only a filter naming an exercise the user has actually logged is applied, so
  // an unknown or malformed value degrades to "no filter" instead of reaching the
  // query as a uuid that cannot be cast.
  const selected = exercises.find((e) => e.id === exercise) ?? null;

  const page = await listWorkouts(db, userId, { exerciseId: selected?.id ?? null });
  // One batch loads the duration, volume and exercise previews for the whole
  // page, for the active card and the completed cards alike.
  const { active, completed, nextCursor } = await enrichWorkoutPage(db, userId, page);

  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Workouts</h1>
        {/* A session need not start from a routine: this opens the same logger
            with an empty exercise list. */}
        <form action={startEmptyWorkoutFormAction}>
          <button
            type="submit"
            className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
          >
            Start empty workout
          </button>
        </form>
      </div>

      {active.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-zinc-500">Active</h2>
          <ul className="mt-2 space-y-2">
            {active.map((w) => (
              <li key={w.id}>
                <WorkoutCard card={w} timeZone={timeZone} active />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-500">History</h2>

          {exercises.length > 0 ? (
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="exercise" className="sr-only">
                Filter by exercise
              </label>
              <select
                id="exercise"
                name="exercise"
                defaultValue={selected?.id ?? ""}
                className="h-9 max-w-48 rounded-md border border-zinc-300 bg-white px-2 text-sm"
              >
                <option value="">All exercises</option>
                {exercises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100"
              >
                Filter
              </button>
            </form>
          ) : null}
        </div>

        {completed.length === 0 ? (
          <p className="mt-2 text-zinc-500">
            {selected ? (
              `No workouts include ${selected.title}.`
            ) : active.length > 0 ? (
              "No completed workouts yet."
            ) : (
              <>
                No workouts yet.{" "}
                <Link href="/routines" className="underline">
                  Start one from a routine
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          // Keyed on the filter: changing it must start a fresh list rather than
          // append a different query's page to the one already on screen.
          <WorkoutHistory
            key={selected?.id ?? "all"}
            initial={completed}
            initialCursor={nextCursor}
            exerciseId={selected?.id ?? null}
            timeZone={timeZone}
          />
        )}
      </section>
    </main>
  );
}
