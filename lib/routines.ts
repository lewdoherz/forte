import { z } from "zod";
import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "./db";
import { normaliseSupersetKeys } from "./supersets";
import {
  SET_TYPES,
  type Routine,
  type RoutineExerciseTree,
  type RoutineSet,
  type RoutineTree,
} from "@/schema/types";

const weightString = z
  .string()
  .trim()
  .refine((s) => /^\d{1,4}(\.\d{1,3})?$/.test(s), "Weight must be a non-negative number");

const routineSetInputSchema = z.object({
  set_type: z.enum(SET_TYPES),
  reps: z.number().int().min(0).nullish(),
  weight_kg: weightString.nullish(),
});

const routineExerciseInputSchema = z.object({
  template_id: z.string().uuid(),
  // Consecutive exercises sharing a key are performed together. Optional: most
  // exercises are not supersetted.
  superset_key: z.string().trim().min(1).max(40).nullish(),
  rest_seconds: z.number().int().min(0).nullish(),
  notes: z.string().trim().max(500).nullish(),
  sets: z.array(routineSetInputSchema).max(50).default([]),
});

export const routineInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  notes: z.string().trim().max(2000).nullish(),
  exercises: z.array(routineExerciseInputSchema).max(100),
});

export type RoutineInput = z.infer<typeof routineInputSchema>;

export interface RoutineListItem extends Routine {
  exercise_count: number;
}

/** The user's routines with an exercise count, ordered by title. */
export function listRoutines(db: Kysely<Database>, userId: string) {
  return db
    .selectFrom("routine as r")
    .select(["r.id", "r.owner_id", "r.folder_id", "r.title", "r.notes", "r.position", "r.created_at", "r.updated_at"])
    .select(
      sql<number>`(select count(*)::int from routine_exercise where routine_id = r.id)`.as(
        "exercise_count",
      ),
    )
    .where("r.owner_id", "=", userId)
    .orderBy("r.title", "asc")
    .execute();
}

/** A routine (owner-scoped) with its ordered exercises and planned sets. */
export async function getRoutineTree(
  db: Kysely<Database>,
  id: string,
  userId: string,
): Promise<RoutineTree | undefined> {
  const routine = await db
    .selectFrom("routine")
    .selectAll()
    .where("id", "=", id)
    .where("owner_id", "=", userId)
    .executeTakeFirst();
  if (!routine) return undefined;

  const exercises = await db
    .selectFrom("routine_exercise")
    .selectAll()
    .where("routine_id", "=", id)
    .orderBy("position", "asc")
    .execute();

  const templateIds = exercises.map((e) => e.template_id);
  const templates = templateIds.length
    ? await db
        .selectFrom("exercise_template")
        .selectAll()
        .where("id", "in", templateIds)
        // Mirrors assertExercisesVisible: a foreign custom template must never
        // resolve here.
        .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", userId)]))
        .execute()
    : [];
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  const sets = exercises.length
    ? await db
        .selectFrom("routine_set")
        .selectAll()
        .where(
          "routine_exercise_id",
          "in",
          exercises.map((e) => e.id),
        )
        .orderBy("position", "asc")
        .execute()
    : [];
  const setsByExercise = new Map<string, RoutineSet[]>();
  for (const s of sets) {
    const list = setsByExercise.get(s.routine_exercise_id);
    if (list) list.push(s);
    else setsByExercise.set(s.routine_exercise_id, [s]);
  }

  return {
    ...routine,
    folder: null,
    exercises: exercises.map(
      (e): RoutineExerciseTree => ({
        ...e,
        template: templateMap.get(e.template_id)!,
        sets: setsByExercise.get(e.id) ?? [],
      }),
    ),
  };
}

/** Rejects any referenced exercise that is not visible to the user. */
async function assertExercisesVisible(
  trx: Transaction<Database>,
  userId: string,
  templateIds: string[],
) {
  const unique = [...new Set(templateIds)];
  if (unique.length === 0) return;
  const rows = await trx
    .selectFrom("exercise_template")
    .select("id")
    .where("archived_at", "is", null)
    .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", userId)]))
    .where("id", "in", unique)
    .execute();
  if (rows.length !== unique.length) throw new Error("invalid_exercise");
}

async function insertExercises(
  trx: Transaction<Database>,
  routineId: string,
  exercises: RoutineInput["exercises"],
) {
  const supersetKeys = normaliseSupersetKeys(exercises);

  for (const [i, ex] of exercises.entries()) {
    const row = await trx
      .insertInto("routine_exercise")
      .values({
        routine_id: routineId,
        template_id: ex.template_id,
        position: i,
        superset_key: supersetKeys[i],
        rest_seconds: ex.rest_seconds ?? null,
        notes: ex.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    for (const [j, s] of ex.sets.entries()) {
      await trx
        .insertInto("routine_set")
        .values({
          routine_exercise_id: row.id,
          position: j,
          set_type: s.set_type,
          reps: s.reps ?? null,
          rep_range_start: null,
          rep_range_end: null,
          weight_kg: s.weight_kg ?? null,
          duration_seconds: null,
          distance_meters: null,
          custom_metric: null,
        })
        .execute();
    }
  }
}

export async function createRoutine(db: Kysely<Database>, userId: string, input: RoutineInput) {
  return db.transaction().execute(async (trx) => {
    await assertExercisesVisible(trx, userId, input.exercises.map((e) => e.template_id));
    const routine = await trx
      .insertInto("routine")
      .values({ owner_id: userId, folder_id: null, title: input.title, notes: input.notes ?? null, position: 0 })
      .returningAll()
      .executeTakeFirstOrThrow();
    await insertExercises(trx, routine.id, input.exercises);
    return routine;
  });
}

export async function updateRoutine(
  db: Kysely<Database>,
  userId: string,
  id: string,
  input: RoutineInput,
) {
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("routine")
      .select(["id", "owner_id"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!existing) throw new Error("not_found");
    if (existing.owner_id !== userId) throw new Error("not_authorized");

    await assertExercisesVisible(trx, userId, input.exercises.map((e) => e.template_id));

    const routine = await trx
      .updateTable("routine")
      .set({ title: input.title, notes: input.notes ?? null })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Replace children atomically: deleting the exercises cascades to their
    // planned sets, then the new tree is re-inserted.
    await trx.deleteFrom("routine_exercise").where("routine_id", "=", id).execute();
    await insertExercises(trx, id, input.exercises);

    return routine;
  });
}

export async function deleteRoutine(db: Kysely<Database>, userId: string, id: string) {
  const existing = await db
    .selectFrom("routine")
    .select(["id", "owner_id"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!existing) throw new Error("not_found");
  if (existing.owner_id !== userId) throw new Error("not_authorized");

  await db.deleteFrom("routine").where("id", "=", id).execute();
}
