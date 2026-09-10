import Link from "next/link";
import { notFound } from "next/navigation";
import type { SetType } from "@/schema/types";
import { db } from "@/lib/db";
import { getRoutineTree } from "@/lib/routines";
import { getVocabularies } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import { startWorkoutFormAction } from "@/lib/workout-actions";
import { DeleteRoutineButton } from "@/components/delete-routine-button";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const routine = await getRoutineTree(db, id, userId);
  if (!routine) notFound();

  const { muscles } = await getVocabularies(db);
  const muscleNames = new Map(muscles.map((m) => [m.code, m.display_name]));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/routines" className="text-sm text-zinc-500 underline">
        ← Routines
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold">{routine.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form action={startWorkoutFormAction}>
            <input type="hidden" name="routineId" value={routine.id} />
            <button
              type="submit"
              className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
            >
              Start workout
            </button>
          </form>
          <Link
            href={`/routines/${routine.id}/edit`}
            className="flex h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
          >
            Edit
          </Link>
          <DeleteRoutineButton id={routine.id} />
        </div>
      </div>

      {routine.notes ? <p className="mt-3 text-sm text-zinc-600">{routine.notes}</p> : null}

      {routine.exercises.length === 0 ? (
        <p className="mt-8 text-zinc-500">This routine has no exercises yet.</p>
      ) : (
        <ol className="mt-8 space-y-4">
          {routine.exercises.map((ex, i) => (
            <li key={ex.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words font-medium">
                  {i + 1}. {ex.template.title}
                </span>
                <span className="shrink-0 text-sm text-zinc-500">
                  {muscleNames.get(ex.template.primary_muscle) ?? ex.template.primary_muscle}
                </span>
              </div>

              {ex.rest_seconds != null ? (
                <div className="mt-1 text-sm text-zinc-500">Rest {ex.rest_seconds}s</div>
              ) : null}
              {ex.notes ? <div className="mt-1 text-sm text-zinc-600">{ex.notes}</div> : null}

              {ex.sets.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm">
                  {ex.sets.map((s) => (
                    <li key={s.id} className="flex gap-2">
                      <span className="w-24 shrink-0 text-zinc-500">{SET_TYPE_LABELS[s.set_type]}</span>
                      <span>
                        {s.reps != null ? `${s.reps} reps` : "—"}
                        {s.weight_kg ? ` @ ${s.weight_kg} kg` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-400">
                  No planned sets.
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
