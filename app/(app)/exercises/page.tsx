import Link from "next/link";
import { db } from "@/lib/db";
import { EXERCISE_TYPE_LABELS, getVocabularies, listExercises } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ExercisesPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await requireSessionUserId();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const muscle = typeof params.muscle === "string" ? params.muscle : "";
  const equipment = typeof params.equipment === "string" ? params.equipment : "";

  const [exercises, { muscles, equipment: equipmentList }] = await Promise.all([
    listExercises(db, userId, { q, muscle, equipment }),
    getVocabularies(db),
  ]);

  const muscleNames = new Map(muscles.map((m) => [m.code, m.display_name]));
  const hasFilters = Boolean(q || muscle || equipment);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Exercises</h1>
        <Link
          href="/exercises/new"
          className="flex h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
        >
          Create exercise
        </Link>
      </div>

      <form method="get" action="/exercises" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name…"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Muscle</span>
          <select
            name="muscle"
            defaultValue={muscle}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">All muscles</option>
            {muscles.map((m) => (
              <option key={m.code} value={m.code}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Equipment</span>
          <select
            name="equipment"
            defaultValue={equipment}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">All equipment</option>
            {equipmentList.map((e) => (
              <option key={e.code} value={e.code}>
                {e.display_name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
        >
          Apply
        </button>
        {hasFilters ? (
          <Link href="/exercises" className="py-2 text-sm text-zinc-500 underline">
            Clear
          </Link>
        ) : null}
      </form>

      {exercises.length === 0 ? (
        <p className="mt-8 text-zinc-500">No exercises found.</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex) => (
            <li key={ex.id}>
              <Link
                href={`/exercises/${ex.id}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{ex.title}</span>
                  {ex.is_custom ? (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      Custom
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  {muscleNames.get(ex.primary_muscle) ?? ex.primary_muscle} ·{" "}
                  {EXERCISE_TYPE_LABELS[ex.exercise_type]}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
