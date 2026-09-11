import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getVocabularies, listExercises } from "@/lib/exercises";
import { getRoutineTree } from "@/lib/routines";
import { requireSessionUserId } from "@/lib/auth-session";
import { RoutineEditor } from "@/components/routine-editor";

export default async function EditRoutinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const routine = await getRoutineTree(db, id, userId);
  if (!routine) redirect("/routines");

  const [exercises, { muscles, equipment }] = await Promise.all([
    listExercises(db, userId, {}),
    getVocabularies(db),
  ]);
  const library = exercises.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    primary_muscle: e.primary_muscle,
    secondary_muscles: e.secondary_muscles,
    exercise_type: e.exercise_type,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Edit routine</h1>
      <RoutineEditor library={library} muscles={muscles} equipment={equipment} initial={routine} />
    </main>
  );
}
