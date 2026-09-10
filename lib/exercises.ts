import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "./db";
import { EXERCISE_TYPES, type ExerciseType } from "@/schema/types";

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
    .where("archived_at", "is", null)
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
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteCustomExercise(db: Kysely<Database>, userId: string, id: string) {
  const existing = await db
    .selectFrom("exercise_template")
    .select(["id", "is_custom", "owner_id"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!existing) throw new Error("not_found");
  if (!existing.is_custom || existing.owner_id !== userId) throw new Error("not_authorized");

  await db.deleteFrom("exercise_template").where("id", "=", id).execute();
}
