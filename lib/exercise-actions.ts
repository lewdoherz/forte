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
  listExercises,
  updateCustomExercise,
  type ExerciseListFilters,
} from "./exercises";
import { toLibraryExercise, type LibraryExercise } from "./exercise-library";

export type ExerciseActionState = { error?: string };

/**
 * The Library panel's filtered read.
 *
 * The panel lives in the exercises layout, which cannot receive `searchParams`,
 * so the filtered list comes back through this action. It calls the same
 * `listExercises` query the old page did, which keeps one filtering
 * implementation — in SQL — rather than a JavaScript copy that could drift.
 */
export async function listExercisesAction(
  filters: ExerciseListFilters,
): Promise<LibraryExercise[]> {
  const userId = await requireSessionUserId();
  const rows = await listExercises(db, userId, {
    q: filters.q?.trim() || undefined,
    muscle: filters.muscle || undefined,
    equipment: filters.equipment || undefined,
  });
  return rows.map(toLibraryExercise);
}

/** Reads the form's optional fields, mapping an absent control to undefined. */
function optionalFields(formData: FormData) {
  return {
    media_url: formData.get("media_url") ?? undefined,
    how_to: formData.get("how_to") ?? undefined,
    // Only a duration exercise renders this control; when it is absent the
    // value stays undefined and create/update persist the 'higher' default.
    duration_record_direction: formData.get("duration_record_direction") ?? undefined,
  };
}

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
    ...optionalFields(formData),
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
    ...optionalFields(formData),
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
