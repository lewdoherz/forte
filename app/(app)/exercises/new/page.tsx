import { db } from "@/lib/db";
import { getVocabularies } from "@/lib/exercises";
import { createExercise } from "@/lib/exercise-actions";
import { ExerciseForm } from "@/components/exercise-form";

export default async function NewExercisePage() {
  const { muscles, equipment } = await getVocabularies(db);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Create exercise</h1>
      <ExerciseForm action={createExercise} muscles={muscles} equipment={equipment} submitLabel="Create exercise" />
    </main>
  );
}
