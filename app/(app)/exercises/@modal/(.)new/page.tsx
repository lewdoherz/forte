import { ExerciseCreateDialog } from "@/components/exercise-create-dialog";

/**
 * Intercepts a client-side navigation to `/exercises/new`, rendering the create
 * dialog over the Library instead of navigating away from it. A hard load of
 * `/exercises/new` is served by `new/page.tsx`, which renders the same dialog.
 */
export default function NewExerciseModal() {
  return <ExerciseCreateDialog dismiss="back" />;
}
