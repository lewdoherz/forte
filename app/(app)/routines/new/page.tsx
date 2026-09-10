import { db } from "@/lib/db";
import { listExercises } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import { RoutineEditor } from "@/components/routine-editor";

export default async function NewRoutinePage() {
  const userId = await requireSessionUserId();
  const exercises = await listExercises(db, userId, {});
  const library = exercises.map((e) => ({
    id: e.id,
    title: e.title,
    primary_muscle: e.primary_muscle,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Create routine</h1>
      <RoutineEditor library={library} />
    </main>
  );
}
