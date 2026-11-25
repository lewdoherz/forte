"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "./db";
import { reportFailure } from "./log";
import { requireSessionUserId } from "./auth-session";
import { getI18n } from "./i18n/server";
import {
  createRoutine,
  deleteRoutine as deleteRoutineById,
  deleteRoutineFolder as deleteRoutineFolderById,
  duplicateRoutine as duplicateRoutineById,
  organizeRoutines,
  routineFolderInputSchemaFor,
  routineInputSchemaFor,
  updateRoutine,
  upsertRoutineFolderWithId,
  type RoutineFolderInput,
  type RoutineInput,
} from "./routines";

export type RoutineActionState = { error?: string; id?: string };

/** Sentinel failures that are normal traffic rather than incidents. */
const EXPECTED_FAILURES = ["not_authorized", "invalid_exercise", "not_found"] as const;

export async function saveRoutine(input: RoutineInput): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const parsed = routineInputSchemaFor(t).safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("routines.error.invalidInput") };
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
      return { error: t("routines.error.notAllowedModify") };
    }
    if (e instanceof Error && e.message === "invalid_exercise") {
      return { error: t("routines.error.invalidExercise") };
    }
    reportFailure("saveRoutine", e, EXPECTED_FAILURES);
    return { error: t("routines.error.saveFailed") };
  }
}

export async function duplicateRoutine(id: string): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: t("routines.error.invalidRoutine") };
  try {
    const copy = await duplicateRoutineById(db, userId, parsedId.data);
    revalidatePath("/routines");
    return { id: copy.id };
  } catch (e) {
    if (e instanceof Error && e.message === "not_found") {
      return { error: t("routines.error.notFound") };
    }
    reportFailure("duplicateRoutine", e, EXPECTED_FAILURES);
    return { error: t("routines.error.duplicateFailed") };
  }
}

export async function deleteRoutine(id: string): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: t("routines.error.invalidRoutine") };
  try {
    await deleteRoutineById(db, userId, parsedId.data);
    revalidatePath("/routines");
    revalidatePath("/workout");
    return {};
  } catch (e) {
    if (e instanceof Error && e.message === "not_authorized") {
      return { error: t("routines.error.notAllowedDelete") };
    }
    reportFailure("deleteRoutine", e, EXPECTED_FAILURES);
    return { error: t("routines.error.deleteFailed") };
  }
}

export async function saveRoutineFolder(input: RoutineFolderInput): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const parsed = routineFolderInputSchemaFor(t).safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("routines.error.invalidInput") };
  }
  try {
    const folder = await upsertRoutineFolderWithId(
      db,
      userId,
      parsed.data.id ?? crypto.randomUUID(),
      parsed.data,
    );
    revalidatePath("/routines");
    revalidatePath("/workout");
    return { id: folder.id };
  } catch (e) {
    if (e instanceof Error && e.message === "not_authorized") {
      return { error: t("routines.error.notAllowedModify") };
    }
    reportFailure("saveRoutineFolder", e, EXPECTED_FAILURES);
    return { error: t("routines.error.saveFailed") };
  }
}

export async function deleteRoutineFolder(id: string): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: t("routines.error.invalidRoutine") };
  try {
    await deleteRoutineFolderById(db, userId, parsedId.data);
    revalidatePath("/routines");
    revalidatePath("/workout");
    return {};
  } catch (e) {
    if (e instanceof Error && e.message === "not_authorized") {
      return { error: t("routines.error.notAllowedDelete") };
    }
    reportFailure("deleteRoutineFolder", e, EXPECTED_FAILURES);
    return { error: t("routines.error.deleteFailed") };
  }
}

export async function organizeRoutinesAction(
  updates: Array<{ id: string; folder_id: string | null; position: number }>,
): Promise<RoutineActionState> {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const schema = z
    .array(
      z.object({
        id: z.string().uuid(),
        folder_id: z.string().uuid().nullable(),
        position: z.number().int().min(0),
      }),
    )
    .max(200);
  const parsed = schema.safeParse(updates);
  if (!parsed.success) return { error: t("routines.error.invalidInput") };
  try {
    await organizeRoutines(db, userId, parsed.data);
    revalidatePath("/routines");
    revalidatePath("/workout");
    return {};
  } catch (e) {
    reportFailure("organizeRoutinesAction", e, EXPECTED_FAILURES);
    return { error: t("routines.error.saveFailed") };
  }
}
