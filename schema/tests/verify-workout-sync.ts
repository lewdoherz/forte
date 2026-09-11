import {
  MAX_SYNC_EXERCISES,
  MAX_SYNC_SETS,
  getWorkoutTree,
  startWorkout,
  syncWorkoutDocument,
  syncWorkoutInputSchema,
} from "../../lib/workouts";
import {
  planExerciseReconciliation,
  planSetReconciliation,
  sameClientValues,
  sameExerciseValues,
  type SyncExercise,
  type SyncSet,
} from "../../lib/workout-sync";
import { createRoutine } from "../../lib/routines";
import type { WorkoutExercise, WorkoutExerciseTree, WorkoutSet, WorkoutTree } from "../../schema/types";
import { createTestDatabase } from "./harness";

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

/**
 * Runs a call that is expected to fail and returns the error message, so a test
 * can compare what two different inputs report — the point of the ownership
 * checks is that a foreign id and a missing one are indistinguishable.
 */
async function errorMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function bail(msg: string): never {
  failed++;
  out.push(`FAIL  ${msg}`);
  console.log(out.join("\n"));
  process.exit(1);
}

const { db, query, close, dialect } = await createTestDatabase();
check(`schema migrations apply (${dialect})`, true);

const mkUser = async (email: string) =>
  (await query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;
const alice = await mkUser("alice@example.com");
const bob = await mkUser("bob@example.com");

const sys = await db.selectFrom("exercise_template").selectAll().where("is_custom", "=", false).execute();
const bench = sys.find((e) => e.title === "Bench Press");
if (!bench) bail("seed fixtures present");
// A local alias so the narrowed type survives into the fixture closures below.
const benchTemplate = bench;

// ---------------------------------------------------------------------------
// planSetReconciliation — pure diff
// ---------------------------------------------------------------------------

/** A stored row, for exercising the pure diff without a database. */
function setRow(id: string, overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    workout_exercise_id: "00000000-0000-0000-0000-000000000000",
    position: 0,
    set_type: "normal",
    reps: null,
    weight_kg: null,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    metrics: {},
    completed_at: null,
    created_at: new Date(0),
    updated_at: new Date(0),
    ...overrides,
  };
}

/** A desired set, for exercising the pure diff without a database. */
function syncSet(id: string, overrides: Partial<SyncSet> = {}): SyncSet {
  return {
    id,
    workout_exercise_id: "00000000-0000-0000-0000-000000000000",
    position: 0,
    set_type: "normal",
    reps: null,
    weight_kg: null,
    rpe: null,
    completed_at: null,
    ...overrides,
  };
}

const u1 = crypto.randomUUID();
const u2 = crypto.randomUUID();
const u3 = crypto.randomUUID();
const u4 = crypto.randomUUID();

{
  const r = planSetReconciliation([], []);
  check(
    "plan: empty document against empty state is a no-op",
    r.insert.length === 0 && r.update.length === 0 && r.remove.length === 0,
  );
}

{
  const r = planSetReconciliation([syncSet(u1), syncSet(u2)], []);
  check(
    "plan: all-new document inserts every set in order",
    r.insert.length === 2 && r.insert[0].id === u1 && r.insert[1].id === u2 && r.remove.length === 0,
  );
}

{
  const r = planSetReconciliation([], [setRow(u1), setRow(u2)]);
  check(
    "plan: empty document removes every stored set",
    r.remove.length === 2 && r.remove[0] === u1 && r.remove[1] === u2 && r.insert.length === 0,
  );
}

{
  // u1 and u2 are present (u2 changed, u1 not), u3 removed, u4 added. `update`
  // lists both present rows; the database layer skips the unchanged u1.
  const rows = [setRow(u1), setRow(u2, { reps: 5 }), setRow(u3)];
  const desired = [syncSet(u1), syncSet(u2, { reps: 8 }), syncSet(u4)];
  const r = planSetReconciliation(desired, rows);
  check(
    "plan: mixed document inserts new, updates present and removes absent ids",
    r.insert.length === 1 &&
      r.insert[0].id === u4 &&
      r.update.length === 2 &&
      r.update[0].id === u1 &&
      r.update[1].id === u2 &&
      r.remove.length === 1 &&
      r.remove[0] === u3,
  );
}

{
  // Same values, different text (numeric scale, omitted milliseconds) — what a
  // replayed sync sends. It must be seen as unchanged, or an UPDATE would bump
  // updated_at and break idempotency.
  const stored = setRow(u1, {
    reps: 5,
    weight_kg: "100.000",
    rpe: "8.0",
    position: 2,
    completed_at: new Date("2026-01-02T03:04:05.000Z"),
  });
  const same = syncSet(u1, {
    reps: 5,
    weight_kg: "100",
    rpe: "8",
    position: 2,
    completed_at: "2026-01-02T03:04:05Z",
  });
  const changed = syncSet(u1, {
    reps: 6,
    weight_kg: "100",
    rpe: "8",
    position: 2,
    completed_at: "2026-01-02T03:04:05Z",
  });
  check("sameClientValues: numerically equal values count as unchanged", sameClientValues(same, stored));
  check("sameClientValues: a changed value counts as a change", !sameClientValues(changed, stored));
}

{
  const rows = [setRow(u1)];
  const desired = [syncSet(u2)];
  const before = JSON.stringify(rows);
  const first = planSetReconciliation(desired, rows);
  const second = planSetReconciliation(desired, rows);
  check(
    "plan: pure — repeats identically and leaves its inputs untouched",
    JSON.stringify(first) === JSON.stringify(second) && JSON.stringify(rows) === before,
  );
}

// ---------------------------------------------------------------------------
// planExerciseReconciliation — the same diff for the exercise list
// ---------------------------------------------------------------------------

/** A stored exercise row, for exercising the pure diff without a database. */
function exerciseRow(id: string, overrides: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    id,
    workout_id: "00000000-0000-0000-0000-000000000000",
    template_id: "00000000-0000-0000-0000-000000000001",
    position: 0,
    superset_key: null,
    rest_seconds: null,
    notes: null,
    created_at: new Date(0),
    updated_at: new Date(0),
    ...overrides,
  };
}

/** A desired exercise, for exercising the pure diff without a database. */
function syncExercise(id: string, overrides: Partial<SyncExercise> = {}): SyncExercise {
  return {
    id,
    template_id: "00000000-0000-0000-0000-000000000001",
    position: 0,
    superset_key: null,
    rest_seconds: null,
    notes: null,
    ...overrides,
  };
}

{
  const r = planExerciseReconciliation([syncExercise(u1), syncExercise(u2)], []);
  check(
    "exercise plan: all-new document inserts every exercise",
    r.insert.length === 2 && r.insert[0].id === u1 && r.remove.length === 0,
  );
}

{
  const r = planExerciseReconciliation([], [exerciseRow(u1), exerciseRow(u2)]);
  check(
    "exercise plan: an empty document removes every stored exercise",
    r.remove.length === 2 && r.insert.length === 0,
  );
}

{
  const rows = [exerciseRow(u1, { position: 0 }), exerciseRow(u2, { position: 1 })];
  const desired = [
    syncExercise(u1, { position: 1 }),
    syncExercise(u2, { position: 0 }),
    syncExercise(u4),
  ];
  const r = planExerciseReconciliation(desired, rows);
  check(
    "exercise plan: a reorder updates both present rows and inserts the new id",
    r.insert.length === 1 && r.insert[0].id === u4 && r.update.length === 2 && r.remove.length === 0,
  );
}

{
  const stored = exerciseRow(u1, { position: 2, rest_seconds: 90, notes: "tempo" });
  const same = syncExercise(u1, { position: 2, rest_seconds: 90, notes: "tempo" });
  const changed = syncExercise(u1, { position: 2, rest_seconds: 120, notes: "tempo" });
  check("sameExerciseValues: unchanged rows count as unchanged", sameExerciseValues(same, stored));
  check(
    "sameExerciseValues: a changed rest target counts as a change",
    !sameExerciseValues(changed, stored),
  );
}

// ---------------------------------------------------------------------------
// Database fixtures
// ---------------------------------------------------------------------------

async function freshAliceWorkout() {
  const routine = await createRoutine(db, alice, {
    title: `Alice ${crypto.randomUUID().slice(0, 8)}`,
    notes: null,
    exercises: [
      {
        template_id: benchTemplate.id,
        superset_key: null,
        rest_seconds: null,
        notes: null,
        sets: [
          { set_type: "normal", reps: 5, weight_kg: "100" },
          { set_type: "normal", reps: 5, weight_kg: "100" },
        ],
      },
    ],
  });
  const started = await startWorkout(db, alice, routine.id);
  const tree = await getWorkoutTree(db, started.id, alice);
  if (!tree) bail("alice workout tree exists");
  return tree;
}

const bobRoutine = await createRoutine(db, bob, {
  title: "Bob Push",
  notes: null,
  exercises: [
    {
      template_id: benchTemplate.id,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5, weight_kg: "80" }],
    },
  ],
});
const bobStarted = await startWorkout(db, bob, bobRoutine.id);
const bobTree = await getWorkoutTree(db, bobStarted.id, bob);
if (!bobTree) bail("bob workout tree exists");

/** Every stored set of one workout, in a stable order. */
async function setsOf(workoutId: string): Promise<WorkoutSet[]> {
  return db
    .selectFrom("workout_set as ws")
    .innerJoin("workout_exercise as we", "we.id", "ws.workout_exercise_id")
    .selectAll("ws")
    .where("we.workout_id", "=", workoutId)
    .orderBy("ws.id", "asc")
    .execute();
}

/** A full tuple of every column, so "identical" is checked, not assumed. */
async function snapshot(workoutId: string): Promise<string> {
  const rows = await setsOf(workoutId);
  return JSON.stringify(
    rows.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      completed_at: r.completed_at ? r.completed_at.toISOString() : null,
    })),
  );
}

async function endedAtOf(workoutId: string): Promise<string | null> {
  const row = await db
    .selectFrom("workout")
    .select("ended_at")
    .where("id", "=", workoutId)
    .executeTakeFirstOrThrow();
  return row.ended_at ? row.ended_at.toISOString() : null;
}

/** The stored row as the client would send it back. */
function toSync(set: WorkoutSet, overrides: Partial<SyncSet> = {}): SyncSet {
  return {
    id: set.id,
    workout_exercise_id: set.workout_exercise_id,
    position: set.position,
    set_type: set.set_type,
    reps: set.reps,
    weight_kg: set.weight_kg,
    rpe: set.rpe,
    completed_at: set.completed_at ? set.completed_at.toISOString() : null,
    ...overrides,
  };
}

/** The stored exercise as the client would send it back. */
function toSyncExercise(exercise: WorkoutExerciseTree): SyncExercise {
  return {
    id: exercise.id,
    template_id: exercise.template_id,
    position: exercise.position,
    superset_key: exercise.superset_key,
    rest_seconds: exercise.rest_seconds,
    notes: exercise.notes,
  };
}

/**
 * A complete document for `tree`: its stored exercises plus the desired sets.
 * Every call that means "sync this workout" goes through here, so no caller can
 * accidentally omit the exercise list the document requires.
 */
function doc(tree: WorkoutTree, sets: SyncSet[], endedAt: string | null = null) {
  return { workoutId: tree.id, endedAt, exercises: tree.exercises.map(toSyncExercise), sets };
}

/** The exercise columns the client sends, for comparing stored state. */
interface StoredExercise {
  id: string;
  template_id: string;
  position: number;
  superset_key: string | null;
  rest_seconds: number | null;
  notes: string | null;
}

/** Every stored exercise of one workout, in position order. */
function exercisesOf(workoutId: string): Promise<StoredExercise[]> {
  return db
    .selectFrom("workout_exercise")
    .selectAll()
    .where("workout_id", "=", workoutId)
    .orderBy("position", "asc")
    .execute();
}

// ---------------------------------------------------------------------------
// Idempotency — the property the whole design rests on
// ---------------------------------------------------------------------------

{
  const tree = await freshAliceWorkout();
  const [firstSet] = tree.exercises[0].sets;
  const desired = tree.exercises[0].sets.map((s, i) =>
    toSync(s, i === 0 ? { reps: 7, weight_kg: "102.5", completed_at: new Date().toISOString() } : {}),
  );

  await syncWorkoutDocument(db, alice, doc(tree, desired));
  const afterFirst = await snapshot(tree.id);
  check(
    "sync applied the document",
    (await setsOf(tree.id)).some((s) => s.id === firstSet.id && s.reps === 7 && s.completed_at !== null),
  );

  await syncWorkoutDocument(db, alice, doc(tree, desired));
  check("replaying the same document changes no row", (await snapshot(tree.id)) === afterFirst);
}

// ---------------------------------------------------------------------------
// Remove / update / insert
// ---------------------------------------------------------------------------

{
  const tree = await freshAliceWorkout();
  const [removedSet, changedSet] = tree.exercises[0].sets;
  const addedId = crypto.randomUUID();
  const desired: SyncSet[] = [
    toSync(changedSet, { reps: 8, completed_at: new Date().toISOString() }),
    syncSet(addedId, {
      workout_exercise_id: tree.exercises[0].id,
      position: 5,
      set_type: "dropset",
      reps: 3,
      weight_kg: "60",
      rpe: "9",
    }),
  ];

  await syncWorkoutDocument(db, alice, doc(tree, desired));
  const rows = await setsOf(tree.id);
  check("a set removed locally is deleted", !rows.some((s) => s.id === removedSet.id));
  check("a changed set is updated", rows.some((s) => s.id === changedSet.id && s.reps === 8));
  check(
    "a set added locally is inserted under its client id",
    rows.some(
      (s) => s.id === addedId && s.set_type === "dropset" && Number(s.weight_kg) === 60 && Number(s.rpe) === 9,
    ),
  );
  check(
    "the reconciled rows are exactly the document",
    rows.length === 2 && rows.every((s) => s.workout_exercise_id === tree.exercises[0].id),
  );
}

// ---------------------------------------------------------------------------
// Server-owned columns survive a sync
// ---------------------------------------------------------------------------

{
  const tree = await freshAliceWorkout();
  const target = tree.exercises[0].sets[0];
  // Give the row values the client never models, the way a machine or another
  // code path would.
  await query(
    `update workout_set
       set set_type = 'warmup', duration_seconds = 42, distance_meters = 100, metrics = $2::jsonb
     where id = $1`,
    [target.id, '{"steps":10}'],
  );
  const desired = tree.exercises[0].sets.map((s) => toSync(s, s.id === target.id ? { reps: 11 } : {}));

  await syncWorkoutDocument(db, alice, doc(tree, desired));
  const row = (await setsOf(tree.id)).find((s) => s.id === target.id);
  if (!row) bail("target set still exists");
  check("sync updates the field the client owns", row.reps === 11);
  check(
    "sync preserves duration, distance and metrics",
    row.duration_seconds === 42 &&
      row.distance_meters === 100 &&
      (row.metrics["steps"] as number) === 10,
  );
  check("sync does not overwrite set_type", row.set_type === "warmup");
}

// ---------------------------------------------------------------------------
// Ownership — a foreign id must be untouchable and indistinguishable from absent
// ---------------------------------------------------------------------------

{
  const aliceTree = await freshAliceWorkout();
  const bobBefore = await snapshot(bobTree.id);
  const aliceBefore = await snapshot(aliceTree.id);
  const bobExerciseId = bobTree.exercises[0].id;
  const bobSetId = bobTree.exercises[0].sets[0].id;

  const foreignWorkout = await errorMessage(() =>
    syncWorkoutDocument(db, alice, doc(bobTree, [])),
  );
  check("another user's workout cannot be synced", foreignWorkout === "not_found");
  check("another user's workout is unchanged", (await snapshot(bobTree.id)) === bobBefore);

  const foreignExercise = await errorMessage(() =>
    syncWorkoutDocument(
      db,
      alice,
      doc(aliceTree, [
        syncSet(crypto.randomUUID(), { workout_exercise_id: bobExerciseId }),
      ]),
    ),
  );
  check("another user's workout_exercise cannot be referenced", foreignExercise === "not_found");
  check(
    "a foreign exercise payload changes nothing",
    (await snapshot(bobTree.id)) === bobBefore && (await snapshot(aliceTree.id)) === aliceBefore,
  );

  const overlapping = [
    ...aliceTree.exercises[0].sets.map((s) => toSync(s)),
    syncSet(bobSetId, { workout_exercise_id: aliceTree.exercises[0].id, position: 9 }),
  ];
  const foreignSet = await errorMessage(() =>
    syncWorkoutDocument(db, alice, doc(aliceTree, overlapping)),
  );
  check("another user's set id cannot be claimed", foreignSet === "not_found");
  check(
    "a foreign set id payload changes nothing",
    (await snapshot(bobTree.id)) === bobBefore && (await snapshot(aliceTree.id)) === aliceBefore,
  );

  // Existence probing: a foreign id and an id that does not exist must produce
  // the same error, or the endpoint answers "did this uuid exist?".
  const absentWorkout = await errorMessage(() =>
    syncWorkoutDocument(db, alice, {
      workoutId: crypto.randomUUID(),
      endedAt: null,
      exercises: [],
      sets: [],
    }),
  );
  check(
    "a foreign workout is indistinguishable from a missing one",
    foreignWorkout === absentWorkout && foreignWorkout === "not_found",
  );
  const absentExercise = await errorMessage(() =>
    syncWorkoutDocument(db, alice, {
      workoutId: aliceTree.id,
      endedAt: null,
      exercises: [],
      sets: [syncSet(crypto.randomUUID(), { workout_exercise_id: crypto.randomUUID() })],
    }),
  );
  check(
    "a foreign workout_exercise is indistinguishable from a missing one",
    foreignExercise === absentExercise && foreignExercise === "not_found",
  );
}

// ---------------------------------------------------------------------------
// ended_at — stamped once, validated against the workout's own span
// ---------------------------------------------------------------------------

{
  const tree = await freshAliceWorkout();
  const desired = tree.exercises[0].sets.map((s) => toSync(s));
  const endedAt = new Date(Date.now() + 1000).toISOString();

  await syncWorkoutDocument(db, alice, doc(tree, desired, endedAt));
  check("endedAt stamps ended_at", (await endedAtOf(tree.id)) === endedAt);

  await syncWorkoutDocument(db, alice, doc(tree, desired, endedAt));
  check("a replayed finish does not move ended_at", (await endedAtOf(tree.id)) === endedAt);

  const refused = await errorMessage(() =>
    syncWorkoutDocument(db, alice, doc(tree, desired)),
  );
  check("a finished workout refuses further reconciliation", refused === "not_active");
}

{
  const tree = await freshAliceWorkout();
  const beforeStart = new Date(new Date(tree.started_at).getTime() - 60_000).toISOString();
  const tooEarly = await errorMessage(() =>
    syncWorkoutDocument(db, alice, doc(tree, [], beforeStart)),
  );
  check("an endedAt before started_at is rejected", tooEarly === "invalid_ended_at");
  check("a rejected finish leaves ended_at null", (await endedAtOf(tree.id)) === null);

  const malformed = await errorMessage(() =>
    syncWorkoutDocument(db, alice, doc(tree, [], "not-a-timestamp")),
  );
  check("a malformed endedAt is rejected", malformed === "invalid_ended_at");

  const finished = await syncWorkoutDocument(db, alice, doc(tree, [], new Date().toISOString()));
  check("the finish itself succeeds", finished === undefined && (await endedAtOf(tree.id)) !== null);
}

// ---------------------------------------------------------------------------
// Payload validation — the action's schema, entirely attacker-controlled input
// ---------------------------------------------------------------------------

{
  const workoutId = crypto.randomUUID();
  const exerciseId = crypto.randomUUID();
  const base = {
    workoutId,
    endedAt: null as string | null,
    exercises: [
      {
        id: exerciseId,
        template_id: crypto.randomUUID(),
        position: 0,
        superset_key: null,
        rest_seconds: 90,
        notes: null,
      },
    ],
    sets: [
      {
        id: crypto.randomUUID(),
        workout_exercise_id: exerciseId,
        position: 0,
        set_type: "normal",
        reps: 5,
        weight_kg: "100",
        rpe: "8",
        completed_at: new Date().toISOString(),
      },
    ],
  };

  check("sync schema accepts a well-formed document", syncWorkoutInputSchema.safeParse(base).success);
  check(
    "sync schema rejects a malformed set id",
    !syncWorkoutInputSchema.safeParse({ ...base, sets: [{ ...base.sets[0], id: "nope" }] }).success,
  );
  check(
    "sync schema rejects a negative position",
    !syncWorkoutInputSchema.safeParse({ ...base, sets: [{ ...base.sets[0], position: -1 }] }).success,
  );
  check(
    "sync schema rejects an out-of-range rpe",
    !syncWorkoutInputSchema.safeParse({ ...base, sets: [{ ...base.sets[0], rpe: "11" }] }).success,
  );
  check(
    "sync schema rejects a malformed completed_at",
    !syncWorkoutInputSchema.safeParse({ ...base, sets: [{ ...base.sets[0], completed_at: "yesterday" }] }).success,
  );
  check(
    "sync schema rejects an unknown set type",
    !syncWorkoutInputSchema.safeParse({ ...base, sets: [{ ...base.sets[0], set_type: "cardio" }] }).success,
  );
  check(
    "sync schema rejects a repeated set id",
    !syncWorkoutInputSchema.safeParse({ ...base, sets: [base.sets[0], { ...base.sets[0] }] }).success,
  );
  check(
    "sync schema rejects two sets sharing a position",
    !syncWorkoutInputSchema.safeParse({
      ...base,
      sets: [{ ...base.sets[0], id: crypto.randomUUID() }, base.sets[0]],
    }).success,
  );
  check(
    "sync schema rejects two exercises sharing a position",
    !syncWorkoutInputSchema.safeParse({
      ...base,
      exercises: [base.exercises[0], { ...base.exercises[0], id: crypto.randomUUID() }],
    }).success,
  );
  check(
    "sync schema rejects a repeated exercise id",
    !syncWorkoutInputSchema.safeParse({
      ...base,
      exercises: [base.exercises[0], { ...base.exercises[0], position: 1 }],
    }).success,
  );
  check(
    "sync schema rejects a negative rest target",
    !syncWorkoutInputSchema.safeParse({
      ...base,
      exercises: [{ ...base.exercises[0], rest_seconds: -1 }],
    }).success,
  );
  const oversized = {
    ...base,
    sets: Array.from({ length: MAX_SYNC_SETS + 1 }, (_, i) => ({
      ...base.sets[0],
      id: crypto.randomUUID(),
      position: i,
    })),
  };
  check("sync schema caps the set document size", !syncWorkoutInputSchema.safeParse(oversized).success);
  const tooManyExercises = {
    ...base,
    exercises: Array.from({ length: MAX_SYNC_EXERCISES + 1 }, (_, i) => ({
      ...base.exercises[0],
      id: crypto.randomUUID(),
      position: i,
    })),
  };
  check(
    "sync schema caps the exercise document size",
    !syncWorkoutInputSchema.safeParse(tooManyExercises).success,
  );
}

// ---------------------------------------------------------------------------
// Exercise reconciliation — add, remove, reorder
// ---------------------------------------------------------------------------

{
  // Two exercises, so a reorder has something to swap and a removal leaves one.
  const routine = await createRoutine(db, alice, {
    title: `Alice ${crypto.randomUUID().slice(0, 8)}`,
    notes: null,
    exercises: [
      {
        template_id: benchTemplate.id,
        superset_key: null,
        rest_seconds: null,
        notes: null,
        sets: [{ set_type: "normal", reps: 5, weight_kg: "100" }],
      },
      {
        template_id: benchTemplate.id,
        superset_key: null,
        rest_seconds: null,
        notes: null,
        sets: [{ set_type: "normal", reps: 5, weight_kg: "90" }],
      },
    ],
  });
  const started = await startWorkout(db, alice, routine.id);
  const tree = await getWorkoutTree(db, started.id, alice);
  if (!tree) bail("alice exercise-reconcile tree exists");

  const [first, second] = tree.exercises;

  // Add: a third exercise and one set under it, exactly as the logger sends it.
  const addedId = crypto.randomUUID();
  const addedSetId = crypto.randomUUID();
  await syncWorkoutDocument(db, alice, {
    workoutId: tree.id,
    endedAt: null,
    exercises: [
      toSyncExercise(first),
      toSyncExercise(second),
      { id: addedId, template_id: benchTemplate.id, position: 2, superset_key: null, rest_seconds: null, notes: null },
    ],
    sets: [
      ...first.sets.map((s) => toSync(s)),
      ...second.sets.map((s) => toSync(s)),
      syncSet(addedSetId, { workout_exercise_id: addedId, position: 0, reps: 3, weight_kg: "50" }),
    ],
  });
  let exercises = await exercisesOf(tree.id);
  check(
    "an exercise added mid-workout is inserted under its client id",
    exercises.length === 3 && exercises.some((e) => e.id === addedId && e.position === 2),
  );
  check(
    "the added exercise's set is stored",
    (await setsOf(tree.id)).some((s) => s.id === addedSetId && Number(s.weight_kg) === 50),
  );

  // Reorder: swap the first two positions, keeping the document otherwise.
  await syncWorkoutDocument(db, alice, {
    workoutId: tree.id,
    endedAt: null,
    exercises: [
      { ...toSyncExercise(first), position: 1 },
      { ...toSyncExercise(second), position: 0 },
      { id: addedId, template_id: benchTemplate.id, position: 2, superset_key: null, rest_seconds: null, notes: null },
    ],
    sets: [],
  });
  exercises = await exercisesOf(tree.id);
  check(
    "reordering updates positions to the document's order",
    exercises.length === 3 && exercises[0].id === second.id && exercises[1].id === first.id,
  );
  check("a reorder removes the sets it no longer lists", (await setsOf(tree.id)).length === 0);

  // Remove: dropping the second exercise takes its (already removed) sets with
  // it; the remaining document is the first exercise and the added one.
  await syncWorkoutDocument(db, alice, {
    workoutId: tree.id,
    endedAt: null,
    exercises: [
      { ...toSyncExercise(first), position: 0 },
      { id: addedId, template_id: benchTemplate.id, position: 1, superset_key: null, rest_seconds: null, notes: null },
    ],
    sets: [],
  });
  exercises = await exercisesOf(tree.id);
  check(
    "an exercise removed from the document is deleted",
    exercises.length === 2 && !exercises.some((e) => e.id === second.id),
  );
  check(
    "the remaining exercises keep the document's order",
    exercises[0].id === first.id && exercises[1].id === addedId,
  );

  // Identity guard: a document renaming an existing exercise's template is
  // rejected rather than silently rewritten.
  const renamed = await errorMessage(() =>
    syncWorkoutDocument(db, alice, {
      workoutId: tree.id,
      endedAt: null,
      exercises: [
        { ...toSyncExercise(first), template_id: crypto.randomUUID() },
        { id: addedId, template_id: benchTemplate.id, position: 1, superset_key: null, rest_seconds: null, notes: null },
      ],
      sets: [],
    }),
  );
  check("a document that renames an exercise is rejected", renamed === "not_found");

  // A template the caller cannot see (another user's custom exercise) cannot be
  // attached, matching every other catalog read.
  const bobCustom = await db
    .insertInto("exercise_template")
    .values({
      slug: `bob-custom-${crypto.randomUUID().slice(0, 8)}`,
      title: "Bob's Secret",
      exercise_type: "weight_reps",
      primary_muscle: benchTemplate.primary_muscle,
      secondary_muscles: [],
      equipment: benchTemplate.equipment,
      is_custom: true,
      owner_id: bob,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const foreignTemplate = await errorMessage(() =>
    syncWorkoutDocument(db, alice, {
      workoutId: tree.id,
      endedAt: null,
      exercises: [
        { id: first.id, template_id: bobCustom.id, position: 0, superset_key: null, rest_seconds: null, notes: null },
      ],
      sets: [],
    }),
  );
  check("another user's template cannot be attached", foreignTemplate === "not_found");
}

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
