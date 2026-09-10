"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "./db";
import { reportFailure } from "./log";
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

  let createdId: string;
  try {
    createdId = (await createCustomExercise(db, userId, parsed.data)).id;
  } catch {
    return { error: "Could not create the exercise." };
  }
  // redirect() deliberately sits OUTSIDE the try: it signals by throwing
  // NEXT_REDIRECT, which a catch block would swallow — reporting a failure
  // after a write that actually succeeded, and inviting a duplicate resubmit.
  revalidatePath("/exercises");
  redirect(`/exercises/${createdId}`);
}

export async function updateExercise(
  id: string,
  _prev: ExerciseActionState | null,
  formData: FormData,
): Promise<ExerciseActionState> {
  const userId = await requireSessionUserId();
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: "Invalid exercise." };
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
    await updateCustomExercise(db, userId, parsedId.data, parsed.data);
  } catch (e) {
    return e instanceof Error && e.message === "not_authorized"
      ? { error: "You don't have permission to edit this exercise." }
      : { error: "Could not update the exercise." };
  }
  // Outside the try — see createExercise.
  revalidatePath("/exercises");
  revalidatePath(`/exercises/${id}`);
  redirect(`/exercises/${id}`);
}

export async function deleteExercise(id: string): Promise<void> {
  const userId = await requireSessionUserId();
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return;
  try {
    await deleteCustomExercise(db, userId, parsedId.data);
  } catch (error) {
    // Ownership is enforced inside deleteCustomExercise, and an exercise that is
    // still referenced is archived rather than failing — so reaching here is
    // genuinely unexpected and must not be discarded silently.
    reportFailure("deleteExercise", error, ["not_authorized", "not_found"]);
  }
  revalidatePath("/exercises");
  redirect("/exercises");
}
