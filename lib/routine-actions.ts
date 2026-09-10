"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireSessionUserId } from "./auth-session";
import {
  createRoutine,
  deleteRoutine as deleteRoutineById,
  routineInputSchema,
  updateRoutine,
  type RoutineInput,
} from "./routines";

export type RoutineActionState = { error?: string; id?: string };

export async function saveRoutine(input: RoutineInput): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  const parsed = routineInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    if (parsed.data.id) {
      const updated = await updateRoutine(db, userId, parsed.data.id, parsed.data);
      revalidatePath("/routines");
      revalidatePath(`/routines/${updated.id}`);
      return { id: updated.id };
    }
    const created = await createRoutine(db, userId, parsed.data);
    revalidatePath("/routines");
    return { id: created.id };
  } catch (e) {
    if (e instanceof Error && e.message === "not_authorized") {
      return { error: "You don't have permission to modify this routine." };
    }
    if (e instanceof Error && e.message === "invalid_exercise") {
      return { error: "One or more exercises are not available to you." };
    }
    return { error: "Could not save the routine." };
  }
}

export async function deleteRoutine(id: string): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  try {
    await deleteRoutineById(db, userId, id);
    revalidatePath("/routines");
    return {};
  } catch (e) {
    return e instanceof Error && e.message === "not_authorized"
      ? { error: "You don't have permission to delete this routine." }
      : { error: "Could not delete the routine." };
  }
}
