import { ExerciseCreateDialog } from "@/components/exercise-create-dialog";

/**
 * Direct visit to `/exercises/new` (no intercepted navigation to overlay). The
 * same dialog the `@modal` route renders, so the two cannot diverge.
 */
export default function NewExercisePage() {
  return <ExerciseCreateDialog dismiss="navigate" />;
}
