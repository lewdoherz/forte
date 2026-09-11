import { ExerciseEditDialog } from "@/components/exercise-edit-dialog";

/** Intercepts a client-side navigation to `/exercises/<id>/edit`. */
export default async function EditExerciseModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExerciseEditDialog id={id} dismiss="back" />;
}
