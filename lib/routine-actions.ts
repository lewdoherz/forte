"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "./db";
import { reportFailure } from "./log";
import { requireSessionUserId } from "./auth-session";
import {
  createRoutine,
  deleteRoutine as deleteRoutineById,
  routineInputSchema,
  updateRoutine,
  type RoutineInput,
} from "./routines";

export type RoutineActionState = { error?: string; id?: string };

/** Sentinel failures that are normal traffic rather than incidents. */
const EXPECTED_FAILURES = ["not_authorized", "invalid_exercise"] as const;

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
    reportFailure("saveRoutine", e, EXPECTED_FAILURES);
    return { error: "Could not save the routine." };
  }
}

export async function deleteRoutine(id: string): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: "Invalid routine." };
  try {
    await deleteRoutineById(db, userId, parsedId.data);
    revalidatePath("/routines");
    return {};
  } catch (e) {
    if (e instanceof Error && e.message === "not_authorized") {
      return { error: "You don't have permission to delete this routine." };
    }
    reportFailure("deleteRoutine", e, EXPECTED_FAILURES);
    return { error: "Could not delete the routine." };
  }
}
