import { cache } from "react";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "./db";
import { DURATION_RECORD_DIRECTIONS, EXERCISE_TYPES, type ExerciseTemplate } from "@/schema/types";
import { pickNullableText, pickText } from "./i18n/content";
import { DEFAULT_LOCALE, createTranslator, getMessages, type Translate } from "./i18n";
import type { Locale } from "./i18n/config";
import { getLocaleSafe } from "./i18n/server";

/**
 * The create/edit form's input. The title is trimmed to 1..120 characters; the
 * type, primary muscle and equipment are persisted codes, so they are only
 * checked for presence rather than re-validated against the vocabularies.
 *
 * The issues are rendered by the exercise form, so the messages come from the
 * translator: a Chinese reader must not be answered by an English validation
 * error.
 */
export function exerciseInputSchemaFor(t: Translate) {
  return z.object({
    title: z
      .string()
      .trim()
      .min(1, t("exercises.validation.titleRequired"))
      .max(120, t("exercises.validation.titleTooLong")),
    exercise_type: z.enum(EXERCISE_TYPES),
    primary_muscle: z.string().min(1, t("exercises.validation.primaryMuscleRequired")),
    secondary_muscles: z
      .array(z.string())
      .max(8, t("exercises.validation.secondaryMusclesTooMany"))
      .default([]),
    equipment: z.string().min(1, t("exercises.validation.equipmentRequired")),
    // Custom-exercise extras. The library catalog's How to text is imported
    // (migration 0010) and its media_url is a video path baked in by the uploader
    // (migration 0012), so neither is authored through this form for system rows.
    // An empty submission is normalised to NULL by the mutations below rather
    // than stored as an empty string.
    how_to: z.string().trim().max(20000, t("exercises.validation.howToTooLong")).optional(),
    media_url: z
      .union([
        z.literal(""),
        z
          .string()
          .trim()
          .max(2048, t("exercises.validation.imageUrlTooLong"))
          .url(t("exercises.validation.imageUrlInvalid")),
      ])
      .optional(),
    // Which duration is a record (0015). Optional, so an exercise type that has
    // no duration (weight_reps, steps_duration, ...) never has to send it and no
    // existing caller has to start sending it. Absent resolves to 'higher' at the
    // write site below, next to the column's own default.
    duration_record_direction: z.enum(DURATION_RECORD_DIRECTIONS).optional(),
  });
}

/**
 * The English-message instance, for callers that have no request locale — the
 * verification suites drive this module directly, outside any request scope.
 */
export const exerciseInputSchema = exerciseInputSchemaFor(
  createTranslator(DEFAULT_LOCALE, getMessages(DEFAULT_LOCALE)),
);

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
export async function listExercises(
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

  // Ordered by the English title, not the localized one: order must not depend
  // on the reader's language. Only the returned text is translated.
  const locale = await getLocaleSafe();
  const rows = await query.orderBy("is_custom", "asc").orderBy("title", "asc").execute();
  return rows.map((row) => localizeExercise(row, locale));
}

/**
 * Swaps a catalog row's English text for the reader's language while keeping the
 * returned field names (`title`, `how_to`) — so no caller learns about the pair
 * of columns. A row with no translation (a custom exercise) keeps its English.
 */
function localizeExercise(row: ExerciseTemplate, locale: Locale): ExerciseTemplate {
  return {
    ...row,
    title: pickText(locale, row.title, row.title_zh),
    how_to: pickNullableText(locale, row.how_to, row.how_to_zh),
  };
}

/** A single exercise, but only if it is visible to `userId`. */
export async function getVisibleExercise(db: Kysely<Database>, id: string, userId: string) {
  const row = await db
    .selectFrom("exercise_template")
    .selectAll()
    .where("id", "=", id)
    // Deliberately NOT filtered on archived_at. Archiving hides a row from
    // browsing, not from reference: workouts and routines already point at
    // archived exercises, and those links have to keep resolving.
    .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", userId)]))
    .executeTakeFirst();
  if (!row) return row;
  return localizeExercise(row, await getLocaleSafe());
}

/**
 * The muscle and equipment vocabularies.
 *
 * Memoised per request: the master-detail shell and the page it wraps both need
 * them, and without this the pair of statements runs once per renderer. Outside
 * a render — scripts and the verification suites — React's `cache` calls
 * straight through, so nothing is retained between calls.
 */
export const getVocabularies = cache(async (db: Kysely<Database>) => {
  const [muscles, equipment, locale] = await Promise.all([
    db.selectFrom("muscle_group").selectAll().orderBy("sort_order", "asc").execute(),
    db.selectFrom("equipment").selectAll().orderBy("sort_order", "asc").execute(),
    getLocaleSafe(),
  ]);
  // Vocabulary order is `sort_order`, which the query above already applied;
  // localizing the label never reorders. The `zh` column is only consulted for a
  // Chinese reader, and a blank/null one falls back to English.
  //
  // Exactly `{ code, display_name }` is returned, not the raw row: these values
  // are handed to client components (the filter form, the library), so spreading
  // the row would ship `display_name_zh` and `sort_order` to the browser — the
  // unused language would appear in every English page's payload and vice versa.
  return {
    muscles: muscles.map((m) => ({
      code: m.code,
      display_name: pickText(locale, m.display_name, m.display_name_zh),
    })),
    equipment: equipment.map((e) => ({
      code: e.code,
      display_name: pickText(locale, e.display_name, e.display_name_zh),
    })),
  };
});

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
