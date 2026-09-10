import { z } from "zod";
import { sql, type Kysely } from "kysely";
import type { Database } from "./db";
import type { WorkoutSet, WorkoutTree } from "@/schema/types";

const weightString = z
  .string()
  .trim()
  .refine((s) => /^\d{1,4}(\.\d{1,3})?$/.test(s), "Weight must be a non-negative number");
const rpeString = z
  .string()
  .trim()
  .refine((s) => /^\d{1,2}(\.\d)?$/.test(s) && Number(s) >= 1 && Number(s) <= 10, "RPE must be between 1 and 10");

export const workoutSetInputSchema = z.object({
  reps: z.number().int().min(0).nullish(),
  weight_kg: weightString.nullish(),
  rpe: rpeString.nullish(),
});

export const logSetInputSchema = workoutSetInputSchema.extend({ setId: z.string().uuid() });
export const addSetInputSchema = z.object({ workoutExerciseId: z.string().uuid() });
export const setIdSchema = z.object({ setId: z.string().uuid() });
export const finishWorkoutInputSchema = z.object({ workoutId: z.string().uuid() });

export type LogSetInput = z.infer<typeof logSetInputSchema>;

/**
 * Starts a workout from an owned routine: snapshots routine title/notes and
 * each exercise + planned set into workout / workout_exercise / workout_set in
 * a single transaction. An existing active workout for the same routine is
 * reused rather than duplicated.
 */
export async function startWorkout(db: Kysely<Database>, userId: string, routineId: string) {
  return db.transaction().execute(async (trx) => {
    const routine = await trx
      .selectFrom("routine")
      .select(["id", "owner_id", "title", "notes"])
      .where("id", "=", routineId)
      .where("owner_id", "=", userId)
      .forUpdate()
      .executeTakeFirst();
    if (!routine) throw new Error("not_authorized");

    const existing = await trx
      .selectFrom("workout")
      .select("id")
      .where("routine_id", "=", routineId)
      .where("owner_id", "=", userId)
      .where("ended_at", "is", null)
      .executeTakeFirst();
    if (existing) return { id: existing.id, created: false };

    const workout = await trx
      .insertInto("workout")
      .values({
        owner_id: userId,
        routine_id: routineId,
        title: routine.title,
        notes: routine.notes,
        started_at: new Date(),
        ended_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const exercises = await trx
      .selectFrom("routine_exercise")
      .selectAll()
      .where("routine_id", "=", routineId)
      .orderBy("position", "asc")
      .execute();

    for (const [i, re] of exercises.entries()) {
      const we = await trx
        .insertInto("workout_exercise")
        .values({
          workout_id: workout.id,
          template_id: re.template_id,
          position: i,
          superset_key: re.superset_key,
          // Snapshotted, not referenced: an in-progress workout must not change
          // when the source routine's rest target is edited.
          rest_seconds: re.rest_seconds,
          notes: re.notes,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const sets = await trx
        .selectFrom("routine_set")
        .selectAll()
        .where("routine_exercise_id", "=", re.id)
        .orderBy("position", "asc")
        .execute();

      for (const [j, rs] of sets.entries()) {
        await trx
          .insertInto("workout_set")
          .values({
            workout_exercise_id: we.id,
            position: j,
            set_type: rs.set_type,
            reps: rs.reps,
            weight_kg: rs.weight_kg,
            duration_seconds: null,
            distance_meters: null,
            rpe: null,
            completed_at: null,
          })
          .execute();
      }
    }

    return { id: workout.id, created: true };
  });
}

export async function getWorkoutTree(
  db: Kysely<Database>,
  id: string,
  userId: string,
): Promise<WorkoutTree | undefined> {
  const workout = await db
    .selectFrom("workout")
    .selectAll()
    .where("id", "=", id)
    .where("owner_id", "=", userId)
    .executeTakeFirst();
  if (!workout) return undefined;

  const exercises = await db
    .selectFrom("workout_exercise")
    .selectAll()
    .where("workout_id", "=", id)
    .orderBy("position", "asc")
    .execute();

  const templateIds = exercises.map((e) => e.template_id);
  const templates = templateIds.length
    ? await db
        .selectFrom("exercise_template")
        .selectAll()
        .where("id", "in", templateIds)
        // Same visibility rule the write path enforces: global rows plus the
        // caller's own. Without it a reference to a foreign template would
        // render that user's exercise.
        .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", userId)]))
        .execute()
    : [];
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  const sets = exercises.length
    ? await db
        .selectFrom("workout_set")
        .selectAll()
        .where(
          "workout_exercise_id",
          "in",
          exercises.map((e) => e.id),
        )
        .orderBy("position", "asc")
        .execute()
    : [];
  const setsByExercise = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const list = setsByExercise.get(s.workout_exercise_id);
    if (list) list.push(s);
    else setsByExercise.set(s.workout_exercise_id, [s]);
  }

  return {
    ...workout,
    exercises: exercises.map((e) => ({
      ...e,
      template: templateMap.get(e.template_id)!,
      sets: setsByExercise.get(e.id) ?? [],
    })),
  };
}

/** Returns the owner + completion state of the workout a set belongs to. */
async function setWorkoutOwner(db: Kysely<Database>, setId: string) {
  return db
    .selectFrom("workout_set as ws")
    .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .select(["w.owner_id", "w.ended_at"])
    .where("ws.id", "=", setId)
    .executeTakeFirst();
}

function assertActiveOwned(
  ctx: { owner_id: string; ended_at: Date | null } | undefined,
  userId: string,
) {
  if (!ctx) throw new Error("not_found");
  if (ctx.owner_id !== userId) throw new Error("not_authorized");
  if (ctx.ended_at !== null) throw new Error("not_active");
}

/**
 * Subquery of `workout_exercise` ids belonging to an active workout owned by
 * `userId`.
 *
 * Mutations apply this to the WRITE itself, not only to a preceding read, so
 * ownership/state cannot change between an authorization check and its write.
 * The preceding checks are kept because they produce accurate errors; this is
 * the enforcement that cannot be raced.
 */
function ownedActiveExerciseIds(db: Kysely<Database>, userId: string) {
  return db
    .selectFrom("workout_exercise as we")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .select("we.id")
    .where("w.owner_id", "=", userId)
    .where("w.ended_at", "is", null);
}

/** Records actual values and marks the set completed. */
export async function logSet(db: Kysely<Database>, userId: string, input: LogSetInput) {
  await assertActiveOwned(await setWorkoutOwner(db, input.setId), userId);
  return db
    .updateTable("workout_set")
    .set({
      reps: input.reps ?? null,
      weight_kg: input.weight_kg ?? null,
      rpe: input.rpe ?? null,
      completed_at: new Date(),
    })
    .where("id", "=", input.setId)
    .where("workout_exercise_id", "in", ownedActiveExerciseIds(db, userId))
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Clears a set's completion without touching its recorded values. */
export async function uncompleteSet(db: Kysely<Database>, userId: string, setId: string) {
  await assertActiveOwned(await setWorkoutOwner(db, setId), userId);
  return db
    .updateTable("workout_set")
    .set({ completed_at: null })
    .where("id", "=", setId)
    .where("workout_exercise_id", "in", ownedActiveExerciseIds(db, userId))
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Appends an empty set to an exercise in an active, owned workout. */
export async function addSet(db: Kysely<Database>, userId: string, workoutExerciseId: string) {
  // Single transaction with the parent row locked: the ownership/state check,
  // the position read and the insert cannot interleave — neither with a
  // concurrent add (which would collide on workout_set_position_key) nor with a
  // concurrent finish that would close the workout mid-append.
  return db.transaction().execute(async (trx) => {
    const parent = await trx
      .selectFrom("workout_exercise as we")
      .innerJoin("workout as w", "w.id", "we.workout_id")
      .select(["w.owner_id", "w.ended_at"])
      .where("we.id", "=", workoutExerciseId)
      .forUpdate()
      .executeTakeFirst();
    assertActiveOwned(parent, userId);

    const pos = await trx
      .selectFrom("workout_set")
      .select((eb) => eb.fn.coalesce(eb.fn.max("position"), eb.val(-1)).as("m"))
      .where("workout_exercise_id", "=", workoutExerciseId)
      .executeTakeFirst();
    const nextPosition = (pos?.m ?? -1) + 1;

    return trx
      .insertInto("workout_set")
      .values({
        workout_exercise_id: workoutExerciseId,
        position: nextPosition,
        set_type: "normal",
        reps: null,
        weight_kg: null,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
        completed_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });
}

/** Removes a set from an active, owned workout. */
export async function removeSet(db: Kysely<Database>, userId: string, setId: string) {
  await assertActiveOwned(await setWorkoutOwner(db, setId), userId);
  await db
    .deleteFrom("workout_set")
    .where("id", "=", setId)
    .where("workout_exercise_id", "in", ownedActiveExerciseIds(db, userId))
    .execute();
}

/** Marks an active workout finished by stamping ended_at. */
export async function finishWorkout(db: Kysely<Database>, userId: string, workoutId: string) {
  const workout = await db
    .selectFrom("workout")
    .select(["id", "owner_id", "ended_at"])
    .where("id", "=", workoutId)
    .executeTakeFirst();
  if (!workout) throw new Error("not_found");
  if (workout.owner_id !== userId) throw new Error("not_authorized");
  if (workout.ended_at !== null) throw new Error("already_finished");

  return db
    .updateTable("workout")
    .set({ ended_at: new Date() })
    .where("id", "=", workoutId)
    .where("owner_id", "=", userId)
    .where("ended_at", "is", null)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * The user's most recent still-active workout, or undefined. Lightweight
 * (indexed on owner_id, started_at) — used by the app shell to offer a resume
 * affordance without loading history.
 */
export function getActiveWorkout(db: Kysely<Database>, userId: string) {
  return db
    .selectFrom("workout")
    .select(["id", "title", "started_at"])
    .where("owner_id", "=", userId)
    .where("ended_at", "is", null)
    .orderBy("started_at", "desc")
    .executeTakeFirst();
}

/** Maximum completed workouts returned by the v1 history list. */
export const HISTORY_LIMIT = 50;

export interface WorkoutSummary {
  id: string;
  title: string;
  notes: string | null;
  started_at: Date;
  ended_at: Date | null;
  exercise_count: number;
  set_count: number;
  completed_set_count: number;
}

/**
 * The user's workouts for the history view, active first then newest first.
 * Bounded so unbounded history is never loaded.
 */
export async function listWorkouts(db: Kysely<Database>, userId: string) {
  const rows = await db
    .selectFrom("workout as w")
    .select(["w.id", "w.title", "w.notes", "w.started_at", "w.ended_at"])
    .select(
      sql<number>`(select count(*)::int from workout_exercise we where we.workout_id = w.id)`.as(
        "exercise_count",
      ),
    )
    .select(
      sql<number>`(select count(*)::int from workout_set ws join workout_exercise we on we.id = ws.workout_exercise_id where we.workout_id = w.id)`.as(
        "set_count",
      ),
    )
    .select(
      sql<number>`(select count(*)::int from workout_set ws join workout_exercise we on we.id = ws.workout_exercise_id where we.workout_id = w.id and ws.completed_at is not null)`.as(
        "completed_set_count",
      ),
    )
    .where("w.owner_id", "=", userId)
    .orderBy(sql`w.ended_at is null`, "desc")
    .orderBy("w.started_at", "desc")
    .limit(HISTORY_LIMIT)
    .execute();

  return {
    active: rows.filter((r) => r.ended_at == null),
    completed: rows.filter((r) => r.ended_at != null),
  };
}

export interface WorkoutStats {
  exerciseCount: number;
  totalSets: number;
  completedSets: number;
  volumeKg: number;
  durationSeconds: number;
}

/**
 * Lightweight summaries derived from the loaded tree. Volume is the sum of
 * weight × reps over completed sets (skipping rows with missing values); it is
 * never stored.
 */
export function summarizeWorkout(workout: WorkoutTree): WorkoutStats {
  const sets = workout.exercises.flatMap((e) => e.sets);
  const volumeKg = sets.reduce((sum, s) => {
    if (s.completed_at == null || s.reps == null || s.weight_kg == null) return sum;
    return sum + Number(s.weight_kg) * s.reps;
  }, 0);
  const end = workout.ended_at ?? new Date();
  return {
    exerciseCount: workout.exercises.length,
    totalSets: sets.length,
    completedSets: sets.filter((s) => s.completed_at != null).length,
    volumeKg,
    durationSeconds: Math.max(0, Math.floor((end.getTime() - workout.started_at.getTime()) / 1000)),
  };
}
