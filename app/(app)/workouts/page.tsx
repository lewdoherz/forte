import Link from "next/link";
import { db } from "@/lib/db";
import { listWorkouts } from "@/lib/workouts";
import { requireSessionUserId } from "@/lib/auth-session";
import { formatDateTime, formatDuration } from "@/lib/format";

export default async function WorkoutsPage() {
  const userId = await requireSessionUserId();
  const { active, completed } = await listWorkouts(db, userId);

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
                    In progress · started {formatDateTime(w.started_at)}
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
        <h2 className="text-sm font-medium text-zinc-500">History</h2>
        {completed.length === 0 ? (
          <p className="mt-2 text-zinc-500">
            {active.length > 0 ? (
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
          <ul className="mt-2 space-y-2">
            {completed.map((w) => {
              const seconds = w.ended_at
                ? Math.floor((w.ended_at.getTime() - w.started_at.getTime()) / 1000)
                : 0;
              return (
                <li key={w.id}>
                  <Link
                    href={`/workouts/${w.id}`}
                    className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-400"
                  >
                    <div className="break-words font-medium">{w.title}</div>
                    <div className="mt-1 text-sm text-zinc-500">
                      {formatDateTime(w.started_at)} · {formatDuration(seconds)} ·{" "}
                      {w.exercise_count} {w.exercise_count === 1 ? "exercise" : "exercises"} ·{" "}
                      {w.completed_set_count}/{w.set_count} sets
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
