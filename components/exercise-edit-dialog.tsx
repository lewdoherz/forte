import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getVisibleExercise, getVocabularies } from "@/lib/exercises";
import { updateExercise } from "@/lib/exercise-actions";
import { requireSessionUserId } from "@/lib/auth-session";
import { ExerciseForm } from "@/components/exercise-form";
import { ExerciseFormModal, type ExerciseDialogDismiss } from "@/components/exercise-form-modal";

/**
 * Edit-exercise dialog, shared by `/exercises/<id>/edit` and its intercepted
 * `@modal` route.
 *
 * The visibility and ownership check is the same one the page used: a caller who
 * is not the custom exercise's owner is redirected to the Library, so merely
 * knowing an id never exposes the form.
 */
export async function ExerciseEditDialog({
  id,
  dismiss,
}: {
  id: string;
  dismiss: ExerciseDialogDismiss;
}) {
  const userId = await requireSessionUserId();
  const exercise = await getVisibleExercise(db, id, userId);

  // Only the owner of a custom exercise may edit it.
  if (!exercise || !exercise.is_custom || exercise.owner_id !== userId) {
    redirect("/exercises");
  }

  const { muscles, equipment } = await getVocabularies(db);

  return (
    <ExerciseFormModal title="Edit exercise" dismiss={dismiss} fallbackHref={`/exercises/${id}`}>
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
          media_url: exercise.media_url,
          how_to: exercise.how_to,
          duration_record_direction: exercise.duration_record_direction,
        }}
      />
    </ExerciseFormModal>
  );
}
