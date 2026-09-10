"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireSessionUserId } from "./auth-session";
import {
  createCustomExercise,
  deleteCustomExercise,
  exerciseInputSchema,
  updateCustomExercise,
} from "./exercises";

export type ExerciseActionState = { error?: string };

export async function createExercise(
  _prev: ExerciseActionState | null,
  formData: FormData,
): Promise<ExerciseActionState> {
  const userId = await requireSessionUserId();
  const parsed = exerciseInputSchema.safeParse({
    title: formData.get("title"),
    exercise_type: formData.get("exercise_type"),
    primary_muscle: formData.get("primary_muscle"),
    secondary_muscles: formData.getAll("secondary_muscles"),
    equipment: formData.get("equipment"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const created = await createCustomExercise(db, userId, parsed.data);
    revalidatePath("/exercises");
    redirect(`/exercises/${created.id}`);
  } catch {
    return { error: "Could not create the exercise." };
  }
}

export async function updateExercise(
  id: string,
  _prev: ExerciseActionState | null,
  formData: FormData,
): Promise<ExerciseActionState> {
  const userId = await requireSessionUserId();
  const parsed = exerciseInputSchema.safeParse({
    title: formData.get("title"),
    exercise_type: formData.get("exercise_type"),
    primary_muscle: formData.get("primary_muscle"),
    secondary_muscles: formData.getAll("secondary_muscles"),
    equipment: formData.get("equipment"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await updateCustomExercise(db, userId, id, parsed.data);
    revalidatePath("/exercises");
    revalidatePath(`/exercises/${id}`);
    redirect(`/exercises/${id}`);
  } catch (e) {
    return e instanceof Error && e.message === "not_authorized"
      ? { error: "You don't have permission to edit this exercise." }
      : { error: "Could not update the exercise." };
  }
}

export async function deleteExercise(id: string): Promise<void> {
  const userId = await requireSessionUserId();
  try {
    await deleteCustomExercise(db, userId, id);
  } catch {
    // Ownership is enforced server-side in deleteCustomExercise; the button is
    // only rendered for owned exercises, so a failure here is a race/edge case.
  }
  revalidatePath("/exercises");
  redirect("/exercises");
}
