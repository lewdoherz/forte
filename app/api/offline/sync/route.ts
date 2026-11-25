import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { getI18n } from "@/lib/i18n/server";
import { reportFailure } from "@/lib/log";
import { deleteRoutine, routineInputSchemaFor, upsertRoutineWithId } from "@/lib/routines";
import { syncOfflineWorkoutDocument, syncWorkoutInputSchemaFor } from "@/lib/workouts";

export const dynamic = "force-dynamic";

const PERMANENT_ERRORS = new Set([
  "not_authorized",
  "not_active",
  "already_finished",
  "invalid_ended_at",
  "not_found",
  "invalid_exercise",
]);

/**
 * Idempotent batch sync endpoint for offline-queued routines and workouts.
 * Returns HTTP 401 when the session has expired so the client preserves all
 * pending work until the same account signs back in.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Session expired. Sign in to sync your saved changes.", code: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const userId = session.user.id;
  const { t } = await getI18n();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload.", code: "INVALID_PAYLOAD" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const routineSchema = routineInputSchemaFor(t);
  const workoutSchema = syncWorkoutInputSchemaFor(t);

  const bodySchema = z.object({
    routines: z
      .array(
        z.object({
          id: z.string().uuid(),
          op: z.enum(["upsert", "delete"]),
          input: routineSchema.optional(),
        }),
      )
      .max(50)
      .default([]),
    workouts: z
      .array(
        z.object({
          sync: workoutSchema,
          createdMeta: z
            .object({
              title: z.string().max(120),
              notes: z.string().max(2000).nullable(),
              routineId: z.string().uuid().nullable(),
              startedAt: z.string().datetime(),
            })
            .optional(),
        }),
      )
      .max(50)
      .default([]),
  });

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? t("workouts.error.invalidState"),
        code: "INVALID_PAYLOAD",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const routineResults: Array<{ id: string; ok: boolean; code?: "permanent" | "transient"; error?: string }> = [];
  const workoutResults: Array<{ id: string; ok: boolean; code?: "permanent" | "transient"; error?: string }> = [];

  // 1. Sync routines first so offline workouts referencing a new routine find it.
  for (const item of parsed.data.routines) {
    try {
      if (item.op === "delete") {
        try {
          await deleteRoutine(db, userId, item.id);
        } catch (err) {
          // Deleting an already-absent routine is idempotent.
          if (!(err instanceof Error && err.message === "not_found")) throw err;
        }
      } else {
        if (!item.input) {
          routineResults.push({ id: item.id, ok: false, code: "permanent", error: t("routines.error.invalidInput") });
          continue;
        }
        await upsertRoutineWithId(db, userId, item.id, item.input);
      }
      routineResults.push({ id: item.id, ok: true });
    } catch (error) {
      reportFailure("offline.syncRoutine", error, [...PERMANENT_ERRORS]);
      const msg = error instanceof Error ? error.message : "";
      routineResults.push({
        id: item.id,
        ok: false,
        code: PERMANENT_ERRORS.has(msg) ? "permanent" : "transient",
        error: t("routines.error.saveFailed"),
      });
    }
  }

  // 2. Sync workouts idempotently (supports both existing and offline-started workouts).
  let anyWorkoutSynced = false;
  for (const item of parsed.data.workouts) {
    try {
      await syncOfflineWorkoutDocument(db, userId, item.sync, item.createdMeta);
      workoutResults.push({ id: item.sync.workoutId, ok: true });
      anyWorkoutSynced = true;
    } catch (error) {
      reportFailure("offline.syncWorkout", error, [...PERMANENT_ERRORS]);
      const msg = error instanceof Error ? error.message : "";
      workoutResults.push({
        id: item.sync.workoutId,
        ok: false,
        code: PERMANENT_ERRORS.has(msg) ? "permanent" : "transient",
        error: t("workouts.error.syncFailed"),
      });
    }
  }

  if (routineResults.some((r) => r.ok)) {
    revalidatePath("/routines");
    revalidatePath("/workout");
    revalidatePath("/");
  }
  if (anyWorkoutSynced) {
    revalidatePath("/workouts");
    revalidatePath("/", "layout");
  }

  return NextResponse.json(
    {
      ok: true,
      syncedAt: new Date().toISOString(),
      routines: routineResults,
      workouts: workoutResults,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
