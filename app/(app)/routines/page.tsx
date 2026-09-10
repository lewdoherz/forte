import Link from "next/link";
import { db } from "@/lib/db";
import { listRoutines } from "@/lib/routines";
import { requireSessionUserId } from "@/lib/auth-session";

export default async function RoutinesPage() {
  const userId = await requireSessionUserId();
  const routines = await listRoutines(db, userId);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Routines</h1>
        <Link
          href="/routines/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Create routine
        </Link>
      </div>

      {routines.length === 0 ? (
        <p className="mt-8 text-zinc-500">No routines yet. Create one to plan your workouts.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {routines.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <Link href={`/routines/${r.id}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
                <div className="text-sm text-zinc-500">
                  {r.exercise_count} {r.exercise_count === 1 ? "exercise" : "exercises"}
                </div>
              </div>
              <Link
                href={`/routines/${r.id}/edit`}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
