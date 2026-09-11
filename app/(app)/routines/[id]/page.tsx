import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getRoutineTree } from "@/lib/routines";
import { getVocabularies } from "@/lib/exercises";
import { requireSession } from "@/lib/auth-session";
import { startWorkoutFormAction } from "@/lib/workout-actions";
import { ExerciseThumbnail } from "@/components/exercise-media";
import { RoutineCardMenu } from "@/components/routine-card-menu";
import { CopyRoutineLinkButton } from "@/components/copy-routine-link";
import { RoutineSummaryBody } from "@/components/routine-summary-panel";

/** "3 sets" / "1 set" — a row's prescribed set count, pluralised once. */
function setCountLabel(count: number): string {
  return `${count} ${count === 1 ? "set" : "sets"}`;
}

export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const userId = session.user.id;
  const { id } = await params;
  const routine = await getRoutineTree(db, id, userId);
  if (!routine) notFound();

  const { muscles } = await getVocabularies(db);

  // getRoutineTree is owner-scoped, so the viewer is the creator. Better Auth
  // maps `name` to app_user.display_name; fall back to the email, as the app
  // layout does, because the column is nullable.
  const createdBy = session.user.name.trim() || session.user.email;

  // The summary is derived from the stored prescription, never persisted. The
  // mapping feeds one shape to both aggregations (role weights and set totals),
  // exactly as the editor's unsaved draft does.
  const summaryExercises = routine.exercises.map((ex) => ({
    primaryMuscle: ex.template.primary_muscle,
    secondaryMuscles: ex.template.secondary_muscles,
    sets: ex.sets.map((s) => ({ setType: s.set_type })),
    restSeconds: ex.rest_seconds,
  }));

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      {/* Two columns from `lg` up, constrained and centred rather than stretched
          to the window; below that it collapses to one column, with the aside
          (actions then summary) following the main content in source order. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <Link href="/routines" className="text-sm text-zinc-500 hover:underline">
            ← Routines
          </Link>

          <h1 className="mt-4 break-words text-2xl font-semibold">{routine.title}</h1>
          {routine.notes ? <p className="mt-3 text-sm text-zinc-600">{routine.notes}</p> : null}

          {routine.exercises.length === 0 ? (
            <p className="mt-8 text-zinc-500">This routine has no exercises yet.</p>
          ) : (
            <ol className="mt-6 space-y-3">
              {routine.exercises.map((ex) => (
                <li
                  key={ex.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
                >
                  <ExerciseThumbnail slug={ex.template.slug} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium">{ex.template.title}</span>
                    {ex.superset_key ? (
                      <span className="mt-1 inline-block rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                        Superset
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm text-zinc-500">
                    {setCountLabel(ex.sets.length)}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {/* Starting a workout remains here, in the routine's main column: the
              aside is the reference's fixed action/summary rail. */}
          <form action={startWorkoutFormAction} className="mt-6">
            <input type="hidden" name="routineId" value={routine.id} />
            <button
              type="submit"
              className="h-11 w-full rounded-md bg-zinc-900 px-4 text-sm font-medium text-white sm:w-auto"
            >
              Start workout
            </button>
          </form>
        </div>

        <aside className="min-w-0 space-y-6">
          {/* Actions card first, summary below it — the reference's order. */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">
              Created by <span className="text-zinc-700">{createdBy}</span>
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href={`/routines/${routine.id}/edit`}
                className="flex h-11 flex-1 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
              >
                Edit Routine
              </Link>
              <RoutineCardMenu id={routine.id} afterDelete="navigate" />
            </div>
            <CopyRoutineLinkButton routineId={routine.id} />
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
