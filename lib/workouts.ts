import { z } from "zod";
import { sql, type Kysely } from "kysely";
import type { Database } from "./db";
import { planSetReconciliation, sameClientValues, type WorkoutSyncInput } from "./workout-sync";
import { SET_TYPES, type WorkoutSet, type WorkoutTree } from "@/schema/types";

const weightString = z
  .string()
  .trim()
  .refine((s) => /^\d{1,4}(\.\d{1,3})?$/.test(s), "Weight must be a non-negative number");
const rpeString = z
  .string()
  .trim()
  .refine((s) => /^\d{1,2}(\.\d)?$/.test(s) && Number(s) >= 1 && Number(s) <= 10, "RPE must be between 1 and 10");

/** Shared guard for ids that reach SQL as a `::uuid` cast. */
const uuidSchema = z.string().uuid();

export const workoutSetInputSchema = z.object({
  reps: z.number().int().min(0).nullish(),
  weight_kg: weightString.nullish(),
  rpe: rpeString.nullish(),
});

export const logSetInputSchema = workoutSetInputSchema.extend({ setId: z.string().uuid() });
export const addSetInputSchema = z.object({ workoutExerciseId: z.string().uuid() });
export const setIdSchema = z.object({ setId: z.string().uuid() });
export const finishWorkoutInputSchema = z.object({ workoutId: z.string().uuid() });

/**
 * How many sets one sync document may carry. A logged workout is a few tens of
 * sets; the cap keeps an attacker-controlled array from being unbounded.
 */
export const MAX_SYNC_SETS = 300;

const syncSetInputSchema = z.object({
  id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  // The client's ordering within its exercise. Bounded so a malformed document
  // cannot store absurd positions; uniqueness per exercise is checked below.
  position: z.number().int().min(0).max(10_000),
  set_type: z.enum(SET_TYPES),
  reps: z.number().int().min(0).max(100_000).nullable(),
  weight_kg: weightString.nullable(),
  rpe: rpeString.nullable(),
  completed_at: z.string().datetime().nullable(),
});

/**
 * The reconciliation action's payload. Entirely attacker-controlled, so it is
 * validated in full before any of it reaches SQL.
 */
export const syncWorkoutInputSchema = z.object({
  workoutId: z.string().uuid(),
  endedAt: z.string().datetime().nullable(),
  sets: z
    .array(syncSetInputSchema)
    .max(MAX_SYNC_SETS)
    // Both refines reject a document the database would reject anyway, but as
    // a clean validation error rather than a constraint violation.
    .refine((sets) => new Set(sets.map((s) => s.id)).size === sets.length, "Duplicate set id")
    .refine(
      (sets) => new Set(sets.map((s) => `${s.workout_exercise_id}:${s.position}`)).size === sets.length,
      "Two sets share a position",
    ),
});

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
 * Makes the database match a client's complete set list for one workout.
 *
 * The client owns the active workout's state (last write wins, see
 * docs/offline-logging.md), so this replaces sets rather than merging: present
 * sets are updated, absent ones deleted, new ones inserted under their
 * client-supplied id. Applying the same document twice performs no writes the
 * second time.
 */
export async function syncWorkoutSets(
  db: Kysely<Database>,
  userId: string,
  input: WorkoutSyncInput,
): Promise<void> {
  // A malformed end time is rejected before any work, so the error does not
  // depend on the set writes that follow.
  if (input.endedAt !== null && Number.isNaN(new Date(input.endedAt).getTime())) {
    throw new Error("invalid_ended_at");
  }

  await db.transaction().execute(async (trx) => {
    // Ownership is part of the locking read, not only a preceding check: a
    // workout owned by anyone else is reported exactly like a missing one, so
    // this path cannot probe for another user's rows. The row lock serializes
    // the reconcile against finishWorkout and against a second sync, so the
    // ended_at state read here cannot change under it.
    const workout = await trx
      .selectFrom("workout")
      .select(["id", "started_at", "ended_at"])
      .where("id", "=", input.workoutId)
      .where("owner_id", "=", userId)
      .forUpdate()
      .executeTakeFirst();
    if (!workout) throw new Error("not_found");

    if (workout.ended_at !== null) {
      // A finished workout refuses further reconciliation. The one exception is
      // replaying the sync that finished it: the document the client holds when
      // it finishes still contains the full set list, and refusing it would
      // make finishing non-idempotent. `ended_at` is already set, so this is a
      // no-op rather than a second write.
      if (input.endedAt === null) throw new Error("not_active");
      return;
    }

    // The exercises of THIS workout, read under the same lock. Every payload
    // exercise id is checked against this set, so a document naming another
    // user's workout_exercise cannot attach a set to it. `ownedActiveExerciseIds`
    // is then applied to each write as a second, unraceable guard.
    const exercises = await trx
      .selectFrom("workout_exercise")
      .select("id")
      .where("workout_id", "=", workout.id)
      .execute();
    const ownedIds = new Set(exercises.map((e) => e.id));
    for (const set of input.sets) {
      if (!ownedIds.has(set.workout_exercise_id)) throw new Error("not_found");
    }

    const existing = await trx
      .selectFrom("workout_set as ws")
      .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
      .selectAll("ws")
      .where("we.workout_id", "=", workout.id)
      .execute();

    // A set cannot move between exercises — the logging screen has no such
    // action — so a document that remaps an existing id is corrupt or hostile.
    // Rejecting keeps the write predicates below exact.
    const existingById = new Map(existing.map((s) => [s.id, s]));
    for (const set of input.sets) {
      const current = existingById.get(set.id);
      if (current && current.workout_exercise_id !== set.workout_exercise_id) {
        throw new Error("not_found");
      }
    }

    const plan = planSetReconciliation(input.sets, existing);

    // A new set id that already exists belongs to a different workout — this
    // workout's rows are in `existing` — and reaching the insert would fail on
    // the primary key, confirming to a probe that the id exists. Check first
    // and reject with the same error a missing row would produce.
    if (plan.insert.length) {
      const clash = await trx
        .selectFrom("workout_set")
        .select("id")
        .where("id", "in", plan.insert.map((s) => s.id))
        .executeTakeFirst();
      if (clash) throw new Error("not_found");
    }

    if (plan.remove.length) {
      await trx
        .deleteFrom("workout_set")
        .where("id", "in", plan.remove)
        .where("workout_exercise_id", "in", ownedActiveExerciseIds(trx, userId))
        .execute();
    }

    for (const set of plan.update) {
      const current = existingById.get(set.id);
      // `update` lists every present row; an UPDATE rewrites `updated_at`
      // through a trigger even when nothing differs, so only rows that actually
      // carry a changed client value are written. This is what makes a replayed
      // sync leave the workout untouched.
      if (current && sameClientValues(set, current)) continue;

      await trx
        .updateTable("workout_set")
        .set({
          // Only the fields the client is the source of. duration_seconds,
          // distance_meters, metrics and set_type are deliberately untouched:
          // the client does not carry them, so writing them would erase values
          // it never saw.
          position: set.position,
          reps: set.reps,
          weight_kg: set.weight_kg,
          rpe: set.rpe,
          completed_at: set.completed_at === null ? null : new Date(set.completed_at),
        })
        .where("id", "=", set.id)
        .where("workout_exercise_id", "=", set.workout_exercise_id)
        .where("workout_exercise_id", "in", ownedActiveExerciseIds(trx, userId))
        .execute();
    }

    for (const set of plan.insert) {
      await trx
        .insertInto("workout_set")
        .values({
          id: set.id,
          workout_exercise_id: set.workout_exercise_id,
          position: set.position,
          set_type: set.set_type,
          reps: set.reps,
          weight_kg: set.weight_kg,
          duration_seconds: null,
          distance_meters: null,
          rpe: set.rpe,
          completed_at: set.completed_at === null ? null : new Date(set.completed_at),
        })
        .execute();
    }

    if (input.endedAt !== null) {
      const endedAt = new Date(input.endedAt);
      // A timestamp before the workout started would report a negative
      // duration; reject rather than record nonsense.
      if (endedAt.getTime() < workout.started_at.getTime()) throw new Error("invalid_ended_at");
      // Stamped last: the write predicates above require the workout to still
      // be active (`ownedActiveExerciseIds`), so finishing before them would
      // make every one of them match nothing.
      await trx
        .updateTable("workout")
        .set({ ended_at: endedAt })
        .where("id", "=", workout.id)
        .where("owner_id", "=", userId)
        // Stamped once: a replayed finish must not move the end time.
        .where("ended_at", "is", null)
        .execute();
    }
  });
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

/** Completed workouts per page in the history list. */
export const HISTORY_PAGE_SIZE = 30;

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

export interface WorkoutPage {
  active: WorkoutSummary[];
  completed: WorkoutSummary[];
  /** Feed back as `cursor` to fetch the next page; null when there is no older workout. */
  nextCursor: string | null;
}

export interface WorkoutQuery {
  cursor?: string | null;
  /** Only workouts containing this exercise template. */
  exerciseId?: string | null;
}

/**
 * The history list's shared projection. Returned so callers can keep chaining
 * `where`/`orderBy` — the three correlated counts are the fiddly part and are
 * worth stating once.
 */
function summaryQuery(db: Kysely<Database>, userId: string) {
  return db
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
    .where("w.owner_id", "=", userId);
}

/**
 * Keyset cursor over `(started_at, id)`. A cursor rather than an offset because
 * history is appended to constantly: with `offset`, logging a workout between two
 * page loads shifts every later page and the reader sees a row twice or not at
 * all. The id breaks ties when two workouts share a timestamp.
 */
function encodeCursor(startedAt: Date, id: string): string {
  return `${startedAt.toISOString()}_${id}`;
}

function decodeCursor(cursor: string | null | undefined): { startedAt: Date; id: string } | null {
  if (!cursor) return null;
  const separator = cursor.lastIndexOf("_");
  if (separator <= 0) return null;

  const startedAt = new Date(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (Number.isNaN(startedAt.getTime()) || id === "") return null;

  return { startedAt, id };
}

/**
 * One page of the user's history, active workout first.
 *
 * Completed workouts are paged; the active one is not, because there is at most
 * one and folding it into the page would let it consume a slot. `nextCursor` is
 * derived from a page fetched one row long, so "is there more" costs no second
 * query.
 */
export async function listWorkouts(
  db: Kysely<Database>,
  userId: string,
  query: WorkoutQuery = {},
): Promise<WorkoutPage> {
  const active = await summaryQuery(db, userId)
    .where("w.ended_at", "is", null)
    .orderBy("w.started_at", "desc")
    .execute();

  let completed = summaryQuery(db, userId).where("w.ended_at", "is not", null);

  // The id reaches SQL as a `::uuid` cast, so an unparseable value would throw
  // instead of filtering. Guarded here so every caller is protected rather than
  // each one having to remember.
  const exerciseId =
    query.exerciseId && uuidSchema.safeParse(query.exerciseId).success ? query.exerciseId : null;

  if (exerciseId) {
    // A workout matches when it contains the exercise, wherever it sits in the
    // workout's order.
    completed = completed.where(
      sql<boolean>`exists (
        select 1 from workout_exercise we
        where we.workout_id = w.id and we.template_id = ${exerciseId}::uuid
      )`,
    );
  }

  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    // Row-value comparison, which matches the (started_at desc, id desc) order
    // exactly and stays correct across equal timestamps.
    completed = completed.where(
      sql<boolean>`(w.started_at, w.id) < (${cursor.startedAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await completed
    .orderBy("w.started_at", "desc")
    .orderBy("w.id", "desc")
    .limit(HISTORY_PAGE_SIZE + 1)
    .execute();

  const hasOlder = rows.length > HISTORY_PAGE_SIZE;
  const page = hasOlder ? rows.slice(0, HISTORY_PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  return {
    active,
    completed: page,
    nextCursor: hasOlder && last ? encodeCursor(last.started_at, last.id) : null,
  };
}

/**
 * The exercises that appear in the user's finished workouts, for the history
 * filter. Built from what they have actually logged rather than the whole
 * catalog, which would offer filters that can only ever return nothing.
 */
export function listLoggedExercises(db: Kysely<Database>, userId: string) {
  return db
    .selectFrom("workout_exercise as we")
    .innerJoin("workout as w", "w.id", "we.workout_id")
    .innerJoin("exercise_template as et", "et.id", "we.template_id")
    .select(["et.id", "et.title"])
    .distinct()
    .where("w.owner_id", "=", userId)
    .where("w.ended_at", "is not", null)
    .orderBy("et.title", "asc")
    .execute();
}

// Re-exported so this module's callers are unchanged, while client components
// import the Kysely-free module directly. See lib/workout-stats.ts.
export { summarizeWorkout, type WorkoutStats } from "./workout-stats";
