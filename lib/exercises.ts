import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "./db";
import { DURATION_RECORD_DIRECTIONS, EXERCISE_TYPES, type ExerciseType } from "@/schema/types";

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: "Weight × Reps",
  bodyweight_reps: "Bodyweight × Reps",
  bodyweight_weighted: "Weighted Bodyweight",
  bodyweight_assisted: "Assisted Bodyweight",
  reps_only: "Reps",
  duration: "Duration",
  weight_duration: "Weight × Duration",
  distance_duration: "Distance × Duration",
  short_distance_weight: "Short Distance × Weight",
  floors_duration: "Floors × Duration",
  steps_duration: "Steps × Duration",
};

export const exerciseInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title is too long"),
  exercise_type: z.enum(EXERCISE_TYPES),
  primary_muscle: z.string().min(1, "Primary muscle is required"),
  secondary_muscles: z.array(z.string()).max(8).default([]),
  equipment: z.string().min(1, "Equipment is required"),
  // Custom-exercise extras. The library catalog's How to text is imported
  // (migration 0010) and its media_url is a video path baked in by the uploader
  // (migration 0012), so neither is authored through this form for system rows.
  // An empty submission is normalised to NULL by the mutations below rather
  // than stored as an empty string.
  how_to: z.string().trim().max(20000, "How to is too long").optional(),
  media_url: z
    .union([z.literal(""), z.string().trim().max(2048).url("Image must be a valid URL")])
    .optional(),
  // Which duration is a record (0015). Optional, so an exercise type that has
  // no duration (weight_reps, steps_duration, ...) never has to send it and no
  // existing caller has to start sending it. Absent resolves to 'higher' at the
  // write site below, next to the column's own default.
  duration_record_direction: z.enum(DURATION_RECORD_DIRECTIONS).optional(),
});

export type ExerciseInput = z.infer<typeof exerciseInputSchema>;

export interface ExerciseListFilters {
  q?: string;
  muscle?: string;
  equipment?: string;
}

/**
 * Exercises visible to `userId`: the global library (owner_id is null) plus the
 * user's own custom exercises. Archived rows and other users' custom exercises
 * are excluded.
 */
export function listExercises(
  db: Kysely<Database>,
  userId: string,
  filters: ExerciseListFilters = {},
) {
  let query = db
    .selectFrom("exercise_template")
    .selectAll()
    .where("archived_at", "is", null)
    .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", userId)]));

  if (filters.q) {
    query = query.where("title", "ilike", `%${filters.q}%`);
  }
  if (filters.muscle) {
    query = query.where("primary_muscle", "=", filters.muscle);
  }
  if (filters.equipment) {
    query = query.where("equipment", "=", filters.equipment);
  }

  return query.orderBy("is_custom", "asc").orderBy("title", "asc").execute();
}

/** A single exercise, but only if it is visible to `userId`. */
export function getVisibleExercise(db: Kysely<Database>, id: string, userId: string) {
  return db
    .selectFrom("exercise_template")
    .selectAll()
    .where("id", "=", id)
    // Deliberately NOT filtered on archived_at. Archiving hides a row from
    // browsing, not from reference: workouts and routines already point at
    // archived exercises, and those links have to keep resolving.
    .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", userId)]))
    .executeTakeFirst();
}

export async function getVocabularies(db: Kysely<Database>) {
  const [muscles, equipment] = await Promise.all([
    db.selectFrom("muscle_group").selectAll().orderBy("sort_order", "asc").execute(),
    db.selectFrom("equipment").selectAll().orderBy("sort_order", "asc").execute(),
  ]);
  return { muscles, equipment };
}

function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "exercise"}-${randomUUID().slice(0, 8)}`;
}

export async function createCustomExercise(
  db: Kysely<Database>,
  userId: string,
  input: ExerciseInput,
) {
  return db
    .insertInto("exercise_template")
    .values({
      slug: makeSlug(input.title),
      title: input.title,
      exercise_type: input.exercise_type,
      primary_muscle: input.primary_muscle,
      secondary_muscles: input.secondary_muscles,
      equipment: input.equipment,
      media_url: input.media_url || null,
      how_to: input.how_to || null,
      duration_record_direction: input.duration_record_direction ?? "higher",
      is_custom: true,
      owner_id: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateCustomExercise(
  db: Kysely<Database>,
  userId: string,
  id: string,
  input: ExerciseInput,
) {
  const existing = await db
    .selectFrom("exercise_template")
    .select(["id", "is_custom", "owner_id"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!existing) throw new Error("not_found");
  if (!existing.is_custom || existing.owner_id !== userId) throw new Error("not_authorized");

  return db
    .updateTable("exercise_template")
    .set({
      title: input.title,
      exercise_type: input.exercise_type,
      primary_muscle: input.primary_muscle,
      secondary_muscles: input.secondary_muscles,
      equipment: input.equipment,
      media_url: input.media_url || null,
      how_to: input.how_to || null,
      duration_record_direction: input.duration_record_direction ?? "higher",
    })
    .where("id", "=", id)
    .where("is_custom", "=", true)
    .where("owner_id", "=", userId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Removes a custom exercise from the owner's library.
 *
 * A template referenced by a routine or a logged workout cannot be physically
 * deleted (`routine_exercise.template_id` / `workout_exercise.template_id` are
 * `NO ACTION`), and history must keep resolving it. Such a template is archived
 * instead — it disappears from the library while existing routines and workouts
 * keep working. This mirrors the behaviour asserted in schema/tests/verify-schema.ts.
 */
export async function deleteCustomExercise(db: Kysely<Database>, userId: string, id: string) {
  const existing = await db
    .selectFrom("exercise_template")
    .select(["id", "is_custom", "owner_id"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!existing) throw new Error("not_found");
  if (!existing.is_custom || existing.owner_id !== userId) throw new Error("not_authorized");

  const [usedInRoutine, usedInWorkout] = await Promise.all([
    db.selectFrom("routine_exercise").select("id").where("template_id", "=", id).executeTakeFirst(),
    db.selectFrom("workout_exercise").select("id").where("template_id", "=", id).executeTakeFirst(),
  ]);

  if (usedInRoutine || usedInWorkout) {
    await db
      .updateTable("exercise_template")
      .set({ archived_at: new Date() })
      .where("id", "=", id)
      .where("owner_id", "=", userId)
      .execute();
    return;
  }

  await db
    .deleteFrom("exercise_template")
    .where("id", "=", id)
    .where("owner_id", "=", userId)
    .execute();
}
