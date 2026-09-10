import {
  addSet,
  finishWorkout,
  getWorkoutTree,
  logSet,
  logSetInputSchema,
  removeSet,
  startWorkout,
  uncompleteSet,
} from "../../lib/workouts";
import { createRoutine, updateRoutine } from "../../lib/routines";
import { createCustomExercise, updateCustomExercise } from "../../lib/exercises";
import { createTestDatabase } from "./harness";

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

async function expectThrow(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    failed++;
    out.push(`FAIL  ${label}  [expected an error]`);
  } catch {
    out.push(`PASS  ${label}`);
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
const squat = sys.find((e) => e.title === "Barbell Back Squat");
if (!bench || !squat) bail("seed fixtures present");

// ---- create a routine for alice -------------------------------------------
const routine = await createRoutine(db, alice, {
  title: "Push Day",
  notes: "snapshot test",
  exercises: [
    {
      template_id: bench.id,
      superset_key: "ss-workouts",
      rest_seconds: 90,
      notes: "warm",
      sets: [
        { set_type: "warmup", reps: 10, weight_kg: "40" },
        { set_type: "normal", reps: 5, weight_kg: "100" },
      ],
    },
    {
      template_id: squat.id,
      superset_key: "ss-workouts",
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5, weight_kg: "120" }],
    },
  ],
});

// ---- start workout ---------------------------------------------------------
const started = await startWorkout(db, alice, routine.id);
check("start workout created", started.created === true);
const workout = await getWorkoutTree(db, started.id, alice);
if (!workout) bail("workout tree exists");
check("workout owner is session user", workout.owner_id === alice);
check("workout title snapshotted", workout.title === "Push Day");
check("workout notes snapshotted", workout.notes === "snapshot test");
check("workout routine provenance set", workout.routine_id === routine.id);
check("workout is active", workout.ended_at == null);
check("workout exercises snapshotted", workout.exercises.length === 2);
check(
  "exercise templates copied in order",
  workout.exercises[0].template_id === bench.id && workout.exercises[1].template_id === squat.id,
);
check(
  "planned set values snapshotted",
  workout.exercises[0].sets.length === 2 &&
    workout.exercises[0].sets[0].reps === 10 &&
    Number(workout.exercises[0].sets[1].weight_kg) === 100,
);
// The rest target is snapshotted onto the workout_exercise (0008) rather than
// read back from the routine, so the logger can offer a timer without breaking
// the snapshot invariant.
check(
  "rest target snapshotted onto the workout",
  workout.exercises[0].rest_seconds === 90 && workout.exercises[1].rest_seconds === null,
);
check(
  "superset grouping snapshotted onto the workout",
  workout.exercises[0].superset_key === "ss-workouts" &&
    workout.exercises[1].superset_key === "ss-workouts",
);

// ---- cross-user start + duplicate prevention ------------------------------
await expectThrow("another user's routine cannot start a workout", () => startWorkout(db, bob, routine.id));
const again = await startWorkout(db, alice, routine.id);
check("repeated start reuses the active workout", again.id === started.id && again.created === false);
const workoutCount = await db
  .selectFrom("workout")
  .select((eb) => eb.fn.countAll().as("n"))
  .where("owner_id", "=", alice)
  .executeTakeFirst();
check("no duplicate workout created", Number(workoutCount?.n) === 1);

// ---- snapshot isolation: routine edits don't touch the workout -------------
await updateRoutine(db, alice, routine.id, {
  title: "Push Day v2",
  notes: null,
  exercises: [
    { template_id: squat.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: 3, weight_kg: "200" }] },
  ],
});
const afterRoutineChange = await getWorkoutTree(db, started.id, alice);
check(
  "workout unchanged after routine edit",
  afterRoutineChange?.title === "Push Day" && afterRoutineChange.exercises.length === 2,
);
// The edited routine dropped both the rest target and the grouping; the started
// workout must keep the values it was created with.
check(
  "rest target survives a routine edit",
  afterRoutineChange?.exercises[0].rest_seconds === 90,
  `${afterRoutineChange?.exercises[0].rest_seconds}`,
);
check(
  "superset grouping survives a routine edit",
  afterRoutineChange?.exercises[0].superset_key === "ss-workouts",
  `${afterRoutineChange?.exercises[0].superset_key}`,
);

// ---- log actual set values -------------------------------------------------
const set0 = workout.exercises[0].sets[1];
const logged = await logSet(db, alice, { setId: set0.id, reps: 6, weight_kg: "105", rpe: "8.5" });
check(
  "log set records actual values",
  logged.reps === 6 && Number(logged.weight_kg) === 105 && Number(logged.rpe) === 8.5,
);
check("log set marks completed", logged.completed_at != null);

const uncompleted = await uncompleteSet(db, alice, set0.id);
check("uncomplete clears completed_at", uncompleted.completed_at === null);

await logSet(db, alice, { setId: set0.id, reps: 6, weight_kg: "105", rpe: "8.5" });
const tree2 = await getWorkoutTree(db, started.id, alice);
check("set completion persists", tree2?.exercises[0].sets[1].completed_at != null);

// ---- add / remove set ------------------------------------------------------
const added = await addSet(db, alice, workout.exercises[0].id);
check("add set appends a set", added.position >= 0);
await removeSet(db, alice, added.id);
const tree3 = await getWorkoutTree(db, started.id, alice);
check("remove set deletes it", !tree3?.exercises[0].sets.some((s) => s.id === added.id));

// ---- cross-user mutation protection ---------------------------------------
await expectThrow("another user cannot modify a set", () =>
  logSet(db, bob, { setId: set0.id, reps: 1, weight_kg: "1", rpe: "6" }),
);
await expectThrow("another user cannot finish the workout", () => finishWorkout(db, bob, started.id));

// ---- finish active workout -------------------------------------------------
const finished = await finishWorkout(db, alice, started.id);
check("finish workout sets ended_at", finished.ended_at != null);
await expectThrow("finishing a completed workout is rejected", () => finishWorkout(db, alice, started.id));

// ---- invalid input (Zod) ---------------------------------------------------
check("negative reps rejected", !logSetInputSchema.safeParse({ setId: set0.id, reps: -1, weight_kg: null, rpe: null }).success);
check("invalid weight rejected", !logSetInputSchema.safeParse({ setId: set0.id, reps: 5, weight_kg: "abc", rpe: null }).success);
check("out-of-range rpe rejected", !logSetInputSchema.safeParse({ setId: set0.id, reps: 5, weight_kg: null, rpe: "11" }).success);

// ---- historical exercise identity (reference semantics) -------------------
const customEx = await createCustomExercise(db, alice, {
  title: "My Bench",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "barbell",
});
const snapRoutine = await createRoutine(db, alice, {
  title: "Snapshot",
  notes: null,
  exercises: [
    { template_id: customEx.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: 5, weight_kg: "100" }] },
  ],
});
const snapWorkout = await startWorkout(db, alice, snapRoutine.id);
const beforeRename = await getWorkoutTree(db, snapWorkout.id, alice);
check(
  "workout references the exercise by stable template_id",
  beforeRename?.exercises[0].template_id === customEx.id,
);

await updateCustomExercise(db, alice, customEx.id, {
  title: "Renamed Bench",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "barbell",
});
const afterRename = await getWorkoutTree(db, snapWorkout.id, alice);
check(
  "workout template_id unchanged after exercise rename",
  afterRename?.exercises[0].template_id === customEx.id,
);
check(
  "exercise title resolves live (identity stable, name not snapshotted)",
  afterRename?.exercises[0].template.title === "Renamed Bench",
);

await expectThrow("system exercise cannot be renamed by a user", () =>
  updateCustomExercise(db, alice, bench.id, {
    title: "Hacked",
    exercise_type: "weight_reps",
    primary_muscle: "chest",
    secondary_muscles: [],
    equipment: "barbell",
  }),
);

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
