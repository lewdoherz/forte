import { ExerciseEditDialog } from "@/components/exercise-edit-dialog";

/** Direct visit to `/exercises/<id>/edit`; the intercepted route renders the same dialog. */
export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExerciseEditDialog id={id} dismiss="navigate" />;
}
