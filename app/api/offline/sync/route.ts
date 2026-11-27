import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { getI18n } from "@/lib/i18n/server";
import { reportFailure } from "@/lib/log";
import {
  deleteRoutine,
  deleteRoutineFolder,
  routineFolderInputSchemaFor,
  routineInputSchemaFor,
  upsertRoutineFolderWithId,
  upsertRoutineWithId,
} from "@/lib/routines";
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

  const folderSchema = routineFolderInputSchemaFor(t);
  const routineSchema = routineInputSchemaFor(t);
  const workoutSchema = syncWorkoutInputSchemaFor(t);

  const bodySchema = z.object({
    folders: z
      .array(
        z.object({
          id: z.string().uuid(),
          op: z.enum(["upsert", "delete"]),
          input: folderSchema.optional(),
        }),
      )
      .max(50)
      .default([]),
    routines: z
      .array(
        z.object({
          id: z.string().uuid(),
          op: z.enum(["upsert", "delete"]),
          input: routineSchema.optional(),
          templateSlugs: z.record(z.string(), z.string()).optional(),
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
          templateSlugs: z.record(z.string(), z.string()).optional(),
          customTemplates: z
            .array(
              z.object({
                id: z.string().uuid(),
                title: z.string().trim().min(1).max(120),
                exercise_type: z.enum([
                  "weight_reps",
                  "bodyweight_reps",
                  "bodyweight_weighted",
                  "bodyweight_assisted",
                  "reps_only",
                  "duration",
                  "weight_duration",
                  "distance_duration",
                  "short_distance_weight",
                  "floors_duration",
                  "steps_duration",
                ]),
              }),
            )
            .max(50)
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

  const folderResults: Array<{ id: string; ok: boolean; code?: "permanent" | "transient"; error?: string }> = [];
  const routineResults: Array<{ id: string; ok: boolean; code?: "permanent" | "transient"; error?: string }> = [];
  const workoutResults: Array<{ id: string; ok: boolean; code?: "permanent" | "transient"; error?: string }> = [];

  // Resolve any bundled-catalog synthetic UUIDs via slug (and create local custom
  // templates from migrated quick workouts) so offline-created data always lands cleanly.
  const allSlugs = new Set<string>();
  for (const item of parsed.data.routines) {
    for (const slug of Object.values(item.templateSlugs ?? {})) allSlugs.add(slug);
  }
  for (const item of parsed.data.workouts) {
    for (const slug of Object.values(item.templateSlugs ?? {})) allSlugs.add(slug);
  }
  const serverIdBySlug = new Map<string, string>();
  if (allSlugs.size > 0) {
    const rows = await db
      .selectFrom("exercise_template")
      .select(["id", "slug"])
      .where("slug", "in", [...allSlugs])
      .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", userId)]))
      .execute();
    for (const row of rows) serverIdBySlug.set(row.slug, row.id);
  }

  // Ensure any migrated legacy custom exercise templates exist for this user.
  const customTemplateIdMap = new Map<string, string>();
  for (const item of parsed.data.workouts) {
    for (const custom of item.customTemplates ?? []) {
      if (customTemplateIdMap.has(custom.id)) continue;
      const existing = await db
        .selectFrom("exercise_template")
        .select(["id", "owner_id"])
        .where("id", "=", custom.id)
        .executeTakeFirst();
      if (existing && (existing.owner_id === null || existing.owner_id === userId)) {
        customTemplateIdMap.set(custom.id, existing.id);
        continue;
      }
      const byTitle = await db
        .selectFrom("exercise_template")
        .select("id")
        .where("owner_id", "=", userId)
        .where("title", "=", custom.title)
        .executeTakeFirst();
      if (byTitle) {
        customTemplateIdMap.set(custom.id, byTitle.id);
        continue;
      }
      const slugBase = custom.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "local-exercise";
      const created = await db
        .insertInto("exercise_template")
        .values({
          slug: `${slugBase}-${custom.id.slice(0, 8)}`,
          title: custom.title,
          exercise_type: custom.exercise_type,
          primary_muscle: "other",
          secondary_muscles: [],
          equipment: "other",
          is_custom: true,
          owner_id: userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      customTemplateIdMap.set(custom.id, created.id);
    }
  }

  const resolveTemplateId = (id: string, slugMap?: Record<string, string>) => {
    const mappedCustom = customTemplateIdMap.get(id);
    if (mappedCustom) return mappedCustom;
    const slug = slugMap?.[id];
    if (slug && serverIdBySlug.has(slug)) return serverIdBySlug.get(slug)!;
    return id;
  };

  // 0. Sync folder upserts first (so new routines referencing them resolve), defer deletes after routines.
  const folderDeletes = parsed.data.folders.filter((f) => f.op === "delete");
  for (const item of parsed.data.folders.filter((f) => f.op === "upsert")) {
    try {
      if (!item.input) {
        folderResults.push({ id: item.id, ok: false, code: "permanent", error: t("routines.error.invalidInput") });
        continue;
      }
      await upsertRoutineFolderWithId(db, userId, item.id, item.input);
      folderResults.push({ id: item.id, ok: true });
    } catch (error) {
      reportFailure("offline.syncFolder", error, [...PERMANENT_ERRORS]);
      const msg = error instanceof Error ? error.message : "";
      folderResults.push({
        id: item.id,
        ok: false,
        code: PERMANENT_ERRORS.has(msg) ? "permanent" : "transient",
        error: t("routines.error.saveFailed"),
      });
    }
  }

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
        const remappedInput = {
          ...item.input,
          exercises: item.input.exercises.map((ex) => ({
            ...ex,
            template_id: resolveTemplateId(ex.template_id, item.templateSlugs),
          })),
        };
        await upsertRoutineWithId(db, userId, item.id, remappedInput);
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

  // Apply folder deletes after routines have moved out.
  for (const item of folderDeletes) {
    try {
      try {
        await deleteRoutineFolder(db, userId, item.id);
      } catch (err) {
        if (!(err instanceof Error && err.message === "not_found")) throw err;
      }
      folderResults.push({ id: item.id, ok: true });
    } catch (error) {
      reportFailure("offline.syncFolderDelete", error, [...PERMANENT_ERRORS]);
      const msg = error instanceof Error ? error.message : "";
      folderResults.push({
        id: item.id,
        ok: false,
        code: PERMANENT_ERRORS.has(msg) ? "permanent" : "transient",
        error: t("routines.error.deleteFailed"),
      });
    }
  }

  // 2. Sync workouts idempotently (supports both existing and offline-started workouts).
  let anyWorkoutSynced = false;
  for (const item of parsed.data.workouts) {
    try {
      const remappedSync = {
        ...item.sync,
        exercises: item.sync.exercises.map((ex) => ({
          ...ex,
          template_id: resolveTemplateId(ex.template_id, item.templateSlugs),
        })),
      };
      await syncOfflineWorkoutDocument(db, userId, remappedSync, item.createdMeta);
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

  if (routineResults.some((r) => r.ok) || folderResults.some((f) => f.ok)) {
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
      folders: folderResults,
      routines: routineResults,
      workouts: workoutResults,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
