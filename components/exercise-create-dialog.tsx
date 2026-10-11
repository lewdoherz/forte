import { db } from "@/lib/db";
import { getVocabularies } from "@/lib/exercises";
import { createExercise } from "@/lib/exercise-actions";
import { getI18n } from "@/lib/i18n/server";
import { ExerciseForm } from "@/components/exercise-form";
import { ExerciseFormModal, type ExerciseDialogDismiss } from "@/components/exercise-form-modal";

/**
 * Create-exercise dialog, rendered by both `/exercises/new` and its intercepted
 * `@modal` route so a direct visit and a Library click look the same. `dismiss`
 * comes from the route, which is the only place that knows which case it is.
 */
export async function ExerciseCreateDialog({ dismiss }: { dismiss: ExerciseDialogDismiss }) {
  const { muscles, equipment } = await getVocabularies(db);
  const { t } = await getI18n();

  return (
    <ExerciseFormModal title={t("exercises.create.title")} dismiss={dismiss}>
      <ExerciseForm
        action={createExercise}
        muscles={muscles}
        equipment={equipment}
        submitLabel={t("exercises.create.title")}
      />
    </ExerciseFormModal>
  );
}
