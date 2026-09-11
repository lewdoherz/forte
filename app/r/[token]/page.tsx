import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveRoutineShare } from "@/lib/share";
import { getVocabularies } from "@/lib/exercises";
import { ExerciseThumbnail } from "@/components/exercise-media";
import { RoutineSummaryBody } from "@/components/routine-summary-panel";

/**
 * A shared routine, readable by anyone holding the token — no session, no
 * account. It lives at the app root rather than under `(app)` precisely because
 * that boundary calls `requireSession` and would redirect a signed-out visitor
 * to sign-in before the token could be read.
 *
 * Read-only by construction: the page renders and never mutates. It has no
 * server action, no form, and `resolveRoutineShare` only reads, so there is no
 * code path from this route that writes anything. The token IS the
 * authorization, and it resolves to exactly one routine.
 *
 * Never cached: a link must stop working the moment it is revoked (or when it
 * expires), so every request re-reads the token's current state.
 */
export const dynamic = "force-dynamic";

// The URL is a capability, not a published page: keep it out of search indexes
// so a shared link cannot surface to someone who was never given it.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** "3 sets" / "1 set" — a row's prescribed set count, pluralised once. */
function setCountLabel(count: number): string {
  return `${count} ${count === 1 ? "set" : "sets"}`;
}

export default async function SharedRoutinePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const routine = await resolveRoutineShare(db, token);
  // An invalid, revoked or expired token is a plain 404: the route reveals
  // nothing about whether a routine exists behind a token that does not work.
  if (!routine) notFound();

  const { muscles } = await getVocabularies(db);

  // The summary is recomputed from the shared prescription through the same
  // functions the owner's page uses (`routineSummary`, `muscleDistribution`),
  // fed by the saved set types — never a second calculation.
  const summaryExercises = routine.exercises.map((exercise) => ({
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: exercise.secondaryMuscles,
    sets: exercise.setTypes.map((setType) => ({ setType })),
    restSeconds: exercise.restSeconds,
  }));

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <p className="text-sm text-zinc-500">Shared routine</p>
          <h1 className="mt-4 break-words text-2xl font-semibold">{routine.title}</h1>
          {routine.notes ? <p className="mt-3 text-sm text-zinc-600">{routine.notes}</p> : null}

          {routine.exercises.length === 0 ? (
            <p className="mt-8 text-zinc-500">This routine has no exercises yet.</p>
          ) : (
            // Order is `routine_exercise.position`, preserved by the resolve query.
            <ol className="mt-6 space-y-3">
              {routine.exercises.map((exercise) => (
                <li
                  key={exercise.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
                >
                  <ExerciseThumbnail slug={exercise.slug} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium">{exercise.title}</span>
                    {exercise.supersetKey ? (
                      <span className="mt-1 inline-block rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                        Superset
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm text-zinc-500">
                    {setCountLabel(exercise.setTypes.length)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">
              Shared by <span className="text-zinc-700">{routine.ownerName ?? "a Forte user"}</span>
            </p>
            <p className="mt-3 text-sm text-zinc-500">
              This is a read-only view of someone else&rsquo;s routine. Nothing here can be edited.
            </p>
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
