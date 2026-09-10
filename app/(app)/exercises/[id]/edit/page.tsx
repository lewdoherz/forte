import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getVisibleExercise, getVocabularies } from "@/lib/exercises";
import { updateExercise } from "@/lib/exercise-actions";
import { requireSessionUserId } from "@/lib/auth-session";
import { ExerciseForm } from "@/components/exercise-form";

export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const exercise = await getVisibleExercise(db, id, userId);

  // Only the owner of a custom exercise may edit it.
  if (!exercise || !exercise.is_custom || exercise.owner_id !== userId) {
    redirect("/exercises");
  }

  const { muscles, equipment } = await getVocabularies(db);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Edit exercise</h1>
      <ExerciseForm
        action={updateExercise.bind(null, id)}
        muscles={muscles}
        equipment={equipment}
        submitLabel="Save changes"
        initial={{
          title: exercise.title,
          exercise_type: exercise.exercise_type,
          primary_muscle: exercise.primary_muscle,
          secondary_muscles: exercise.secondary_muscles,
          equipment: exercise.equipment,
        }}
      />
    </main>
  );
}
