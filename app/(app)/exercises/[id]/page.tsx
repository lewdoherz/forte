import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EXERCISE_TYPE_LABELS, getVisibleExercise, getVocabularies } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import { DeleteExerciseButton } from "@/components/delete-exercise-button";

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const exercise = await getVisibleExercise(db, id, userId);
  if (!exercise) notFound();

  const { muscles, equipment: equipmentList } = await getVocabularies(db);
  const muscleNames = new Map(muscles.map((m) => [m.code, m.display_name]));
  const equipmentNames = new Map(equipmentList.map((e) => [e.code, e.display_name]));
  const secondary = exercise.secondary_muscles.map((code) => muscleNames.get(code) ?? code);
  const isOwner = exercise.is_custom && exercise.owner_id === userId;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/exercises" className="text-sm text-zinc-500 underline">
        ← Exercises
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{exercise.title}</h1>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
          {exercise.is_custom ? "Custom exercise" : "Library exercise"}
        </span>
      </div>

      <dl className="mt-6 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-zinc-500">Primary muscle</dt>
          <dd className="text-sm font-medium">{muscleNames.get(exercise.primary_muscle) ?? exercise.primary_muscle}</dd>
        </div>
        {secondary.length > 0 ? (
          <div className="flex justify-between px-4 py-3">
            <dt className="text-sm text-zinc-500">Secondary muscles</dt>
            <dd className="text-sm font-medium">{secondary.join(", ")}</dd>
          </div>
        ) : null}
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-zinc-500">Equipment</dt>
          <dd className="text-sm font-medium">{equipmentNames.get(exercise.equipment) ?? exercise.equipment}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-zinc-500">Type</dt>
          <dd className="text-sm font-medium">{EXERCISE_TYPE_LABELS[exercise.exercise_type]}</dd>
        </div>
      </dl>

      {isOwner ? (
        <div className="mt-6 flex items-center gap-3">
          <Link
            href={`/exercises/${exercise.id}/edit`}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            Edit
          </Link>
          <DeleteExerciseButton id={exercise.id} />
        </div>
      ) : null}
    </main>
  );
}
