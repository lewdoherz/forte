import Link from "next/link";
import { db } from "@/lib/db";
import { listLoggedExercises, listWorkouts } from "@/lib/workouts";
import { getUserProfile } from "@/lib/users";
import { requireSessionUserId } from "@/lib/auth-session";
import { DEFAULT_TIME_ZONE, formatDateTimeInTimeZone } from "@/lib/timezone";
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

  const { active, completed, nextCursor } = await listWorkouts(db, userId, {
    exerciseId: selected?.id ?? null,
  });

  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Workouts</h1>

      {active.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-zinc-500">Active</h2>
          <ul className="mt-2 space-y-2">
            {active.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4"
              >
                <div className="min-w-0">
                  <Link href={`/workouts/${w.id}`} className="break-words font-medium hover:underline">
                    {w.title}
                  </Link>
                  <div className="text-sm text-zinc-600">
                    In progress · started {formatDateTimeInTimeZone(w.started_at, timeZone)}
                  </div>
                </div>
                <Link
                  href={`/workouts/${w.id}`}
                  className="flex h-10 shrink-0 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
                >
                  Resume
                </Link>
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
