import {
  createRoutine,
  deleteRoutine,
  duplicateRoutine,
  getRoutineTree,
  listRoutines,
  routineInputSchema,
  updateRoutine,
} from "../../lib/routines";
import { createCustomExercise } from "../../lib/exercises";
import { EXERCISE_TYPES, type ExerciseType } from "../../schema/types";
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

const { db, query, close, dialect } = await createTestDatabase();
check(`schema migrations apply (${dialect})`, true);

const mkUser = async (email: string) =>
  (await query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;

const alice = await mkUser("alice@example.com");
const bob = await mkUser("bob@example.com");

const sys = await db.selectFrom("exercise_template").selectAll().where("is_custom", "=", false).execute();
const bench = sys.find((e) => e.title === "Bench Press");
const squat = sys.find((e) => e.title === "Barbell Back Squat");
check("seed fixtures present", !!bench && !!squat);

const aliceCustom = await createCustomExercise(db, alice, {
  title: "Alice Secret",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "barbell",
});

// ---- create routine -------------------------------------------------------
const created = await createRoutine(db, alice, {
  title: "Push Day",
  notes: "Chest + shoulders",
  exercises: [
    {
      template_id: bench!.id,
      rest_seconds: 90,
      notes: "warm up",
      sets: [
        { set_type: "warmup", reps: 10, weight_kg: "40" },
        { set_type: "normal", reps: 5, weight_kg: "100" },
      ],
    },
    {
      template_id: squat!.id,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5, weight_kg: "120" }],
    },
  ],
});
check("create routine assigns owner", created.owner_id === alice);

// ---- read own routine tree -------------------------------------------------
const tree = await getRoutineTree(db, created.id, alice);
check("read own routine", tree?.title === "Push Day");
check(
  "exercises preserve order",
  tree?.exercises.map((e) => e.template.title).join(",") === "Bench Press,Barbell Back Squat",
);
check(
  "planned sets preserve order and values",
  tree?.exercises[0].sets.length === 2 &&
    tree.exercises[0].sets[0].set_type === "warmup" &&
    tree.exercises[0].sets[0].reps === 10 &&
    Number(tree.exercises[0].sets[1].weight_kg) === 100,
);

// ---- ownership reads -------------------------------------------------------
check("another user cannot read the routine", (await getRoutineTree(db, created.id, bob)) === undefined);
const aliceList = await listRoutines(db, alice);
check("list shows own routine", aliceList.some((r) => r.id === created.id));
check(
  "list returns exercise names in routine order",
  aliceList.find((r) => r.id === created.id)?.exercise_names.join(",") ===
    "Bench Press,Barbell Back Squat",
);
const bobList = await listRoutines(db, bob);
check("list excludes another user's routine", !bobList.some((r) => r.id === created.id));

// ---- update own routine ----------------------------------------------------
const updated = await updateRoutine(db, alice, created.id, {
  title: "Push Day v2",
  notes: null,
  exercises: [
    { template_id: bench!.id, rest_seconds: 60, notes: null, sets: [{ set_type: "normal", reps: 8, weight_kg: "80" }] },
  ],
});
check("update own routine", updated.title === "Push Day v2");
const updatedTree = await getRoutineTree(db, created.id, alice);
check(
  "update replaced children",
  updatedTree?.exercises.length === 1 && updatedTree.exercises[0].sets.length === 1,
);

// ---- set targets -----------------------------------------------------------
// A routine prescribes whatever its exercise type uses. The editor sends only
// the fields that type has, so a duration set carries seconds and a distance
// set carries metres — never a forced weight × reps shape.
const plank = sys.find((e) => e.title === "Plank");
const running = sys.find((e) => e.title === "Running");
check("duration and distance fixtures present", !!plank && !!running);

const targets = await createRoutine(db, alice, {
  title: "Cardio Targets",
  notes: null,
  exercises: [
    {
      template_id: plank!.id,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", duration_seconds: 60, distance_meters: null, reps: null, weight_kg: null }],
    },
    {
      template_id: running!.id,
      rest_seconds: null,
      notes: null,
      sets: [
        { set_type: "normal", duration_seconds: 900, distance_meters: 3000, reps: null, weight_kg: null },
      ],
    },
  ],
});
const targetsTree = await getRoutineTree(db, targets.id, alice);
check(
  "duration target round-trips without reps or weight",
  targetsTree?.exercises[0].sets[0].duration_seconds === 60 &&
    targetsTree.exercises[0].sets[0].distance_meters === null &&
    targetsTree.exercises[0].sets[0].reps === null &&
    targetsTree.exercises[0].sets[0].weight_kg === null,
);
check(
  "distance and duration targets round-trip together",
  targetsTree?.exercises[1].sets[0].distance_meters === 3000 &&
    targetsTree.exercises[1].sets[0].duration_seconds === 900,
);

// An update replaces the targets; it must not merge a stale value back in.
await updateRoutine(db, alice, targets.id, {
  title: "Cardio Targets v2",
  notes: null,
  exercises: [
    {
      template_id: plank!.id,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", duration_seconds: 90, distance_meters: null, reps: null, weight_kg: null }],
    },
  ],
});
const targetsAfter = await getRoutineTree(db, targets.id, alice);
check(
  "update replaces a set's targets",
  targetsAfter?.exercises.length === 1 &&
    targetsAfter.exercises[0].sets[0].duration_seconds === 90 &&
    targetsAfter.exercises[0].sets[0].distance_meters === null,
);

// A duplicate must carry the targets it was copied from, not just reps/weight.
const targetsCopy = await duplicateRoutine(db, alice, targets.id);
const targetsCopyTree = await getRoutineTree(db, targetsCopy.id, alice);
check(
  "duplicate carries a duration target",
  targetsCopyTree?.exercises[0].sets[0].duration_seconds === 90,
);
await deleteRoutine(db, alice, targetsCopy.id);
await deleteRoutine(db, alice, targets.id);

// ---- every supported type --------------------------------------------------
// A routine must be able to prescribe all eleven exercise types. The editor
// sends the fields the type uses and null for the rest, and floors/steps ride
// in `metrics` — the same shape the completed-workout side stores.
interface TypeTargetCase {
  reps?: number;
  weight_kg?: string;
  duration_seconds?: number;
  distance_meters?: number;
  steps?: number;
  floors?: number;
}

const PER_TYPE_TARGETS: Record<ExerciseType, TypeTargetCase> = {
  weight_reps: { reps: 8, weight_kg: "60" },
  bodyweight_reps: { reps: 12 },
  bodyweight_weighted: { reps: 10, weight_kg: "20" },
  bodyweight_assisted: { reps: 10, weight_kg: "15" },
  reps_only: { reps: 15 },
  duration: { duration_seconds: 120 },
  weight_duration: { weight_kg: "40", duration_seconds: 90 },
  distance_duration: { distance_meters: 500, duration_seconds: 180 },
  short_distance_weight: { distance_meters: 100, weight_kg: "25" },
  floors_duration: { floors: 5, duration_seconds: 300 },
  steps_duration: { steps: 100, duration_seconds: 240 },
};

/** One planned set for a type, carrying only that type's target fields. */
function setForType(type: ExerciseType) {
  const t = PER_TYPE_TARGETS[type];
  return {
    set_type: "normal" as const,
    reps: t.reps ?? null,
    weight_kg: t.weight_kg ?? null,
    duration_seconds: t.duration_seconds ?? null,
    distance_meters: t.distance_meters ?? null,
    metrics:
      t.steps !== undefined ? { steps: t.steps } : t.floors !== undefined ? { floors: t.floors } : {},
  };
}

// `reps_only` and a few others have no global catalog row, so the fixture is a
// custom exercise of that type — the type itself is what the editor keys on.
const typeFixtures: { type: ExerciseType; template_id: string }[] = [];
for (const type of EXERCISE_TYPES) {
  const global = sys.find((e) => e.exercise_type === type);
  if (global) {
    typeFixtures.push({ type, template_id: global.id });
    continue;
  }
  const custom = await createCustomExercise(db, alice, {
    title: `Alice ${type}`,
    exercise_type: type,
    primary_muscle: "chest",
    secondary_muscles: [],
    equipment: "barbell",
  });
  typeFixtures.push({ type, template_id: custom.id });
}
check("every exercise type has a fixture", typeFixtures.length === EXERCISE_TYPES.length);

const everyType = await createRoutine(db, alice, {
  title: "Every Type",
  notes: null,
  exercises: typeFixtures.map((f) => ({
    template_id: f.template_id,
    rest_seconds: null,
    notes: null,
    sets: [setForType(f.type)],
  })),
});
const everyTypeTree = await getRoutineTree(db, everyType.id, alice);

for (const [index, f] of typeFixtures.entries()) {
  const set = everyTypeTree?.exercises[index]?.sets[0];
  const t = PER_TYPE_TARGETS[f.type];
  const ok =
    !!set &&
    (t.reps === undefined ? set.reps === null : set.reps === t.reps) &&
    (t.weight_kg === undefined ? set.weight_kg === null : Number(set.weight_kg) === Number(t.weight_kg)) &&
    (t.duration_seconds === undefined
      ? set.duration_seconds === null
      : set.duration_seconds === t.duration_seconds) &&
    (t.distance_meters === undefined
      ? set.distance_meters === null
      : set.distance_meters === t.distance_meters) &&
    (t.steps === undefined ? set.metrics.steps === undefined : set.metrics.steps === t.steps) &&
    (t.floors === undefined ? set.metrics.floors === undefined : set.metrics.floors === t.floors);
  check(
    `${f.type} round-trips its target fields`,
    ok,
    set ? JSON.stringify({ ...set, metrics: set.metrics }) : "no set",
  );
}

// A type with no sidecar metric stores an empty object, not null, so the
// completed side always reads a well-formed SetMetrics.
const firstEveryTypeSet = everyTypeTree?.exercises[0]?.sets[0];
check(
  "a non-metric type stores an empty metrics object",
  !!firstEveryTypeSet &&
    firstEveryTypeSet.metrics !== null &&
    Object.keys(firstEveryTypeSet.metrics).length === 0,
);

// A duplicate is written through createRoutine; it must carry metrics too.
const everyTypeCopy = await duplicateRoutine(db, alice, everyType.id);
const everyTypeCopyTree = await getRoutineTree(db, everyTypeCopy.id, alice);
const floorsIndex = typeFixtures.findIndex((f) => f.type === "floors_duration");
const stepsIndex = typeFixtures.findIndex((f) => f.type === "steps_duration");
check(
  "duplicate carries a floors target",
  everyTypeCopyTree?.exercises[floorsIndex].sets[0].metrics.floors === 5,
);
check(
  "duplicate carries a steps target",
  everyTypeCopyTree?.exercises[stepsIndex].sets[0].metrics.steps === 100,
);
await deleteRoutine(db, alice, everyTypeCopy.id);

// An update replaces metrics; it must not merge a stale value back in.
await updateRoutine(db, alice, everyType.id, {
  title: "Every Type v2",
  notes: null,
  exercises: [
    {
      template_id: typeFixtures[floorsIndex].template_id,
      rest_seconds: null,
      notes: null,
      sets: [
        {
          set_type: "normal",
          reps: null,
          weight_kg: null,
          duration_seconds: 300,
          distance_meters: null,
          metrics: { floors: 8 },
        },
      ],
    },
  ],
});
const everyTypeAfter = await getRoutineTree(db, everyType.id, alice);
check(
  "update replaces a set's metrics",
  everyTypeAfter?.exercises.length === 1 &&
    everyTypeAfter.exercises[0].sets[0].metrics.floors === 8 &&
    everyTypeAfter.exercises[0].sets[0].metrics.steps === undefined,
);
await deleteRoutine(db, alice, everyType.id);

// ---- pre-0014 data ---------------------------------------------------------
// Rows written before the migration have no metrics; the column default must
// make them read as an empty SetMetrics rather than null or a missing column.
const legacyRoutineId = (
  await query<{ id: string }>(`insert into routine (owner_id, title) values ($1, 'Legacy') returning id`, [
    alice,
  ])
).rows[0].id;
const legacyExerciseId = (
  await query<{ id: string }>(
    `insert into routine_exercise (routine_id, template_id, position) values ($1, $2, 0) returning id`,
    [legacyRoutineId, squat!.id],
  )
).rows[0].id;
await query(
  `insert into routine_set (routine_exercise_id, position, set_type, reps) values ($1, 0, 'normal', 8)`,
  [legacyExerciseId],
);
const legacyTree = await getRoutineTree(db, legacyRoutineId, alice);
check(
  "a pre-0014 row reads an empty metrics object",
  !!legacyTree &&
    legacyTree.exercises[0].sets[0].reps === 8 &&
    legacyTree.exercises[0].sets[0].metrics !== null &&
    Object.keys(legacyTree.exercises[0].sets[0].metrics).length === 0,
);
await deleteRoutine(db, alice, legacyRoutineId);

// ---- reorder round-trip ----------------------------------------------------
// The editor reorders the draft, then saves the whole tree. Positions are
// renumbered from array order on save, so an update must persist the new order
// with dense 0..n-1 positions, and every ordered read must agree with it.
const reorder = await createRoutine(db, alice, {
  title: "Reorder Day",
  notes: null,
  exercises: [
    { template_id: bench!.id, rest_seconds: null, notes: null, sets: [] },
    { template_id: squat!.id, rest_seconds: null, notes: null, sets: [] },
    { template_id: aliceCustom.id, rest_seconds: null, notes: null, sets: [] },
  ],
});
await updateRoutine(db, alice, reorder.id, {
  title: "Reorder Day",
  notes: null,
  exercises: [
    { template_id: aliceCustom.id, rest_seconds: null, notes: null, sets: [] },
    { template_id: bench!.id, rest_seconds: null, notes: null, sets: [] },
    { template_id: squat!.id, rest_seconds: null, notes: null, sets: [] },
  ],
});
const reorderExpected = `${aliceCustom.id},${bench!.id},${squat!.id}`;
const reorderTree = await getRoutineTree(db, reorder.id, alice);
check(
  "update persists the reordered exercise order",
  reorderTree?.exercises.map((e) => e.template_id).join(",") === reorderExpected,
);
const positionRows = (
  await query<{ position: number; template_id: string }>(
    "select position, template_id from routine_exercise where routine_id = $1 order by position",
    [reorder.id],
  )
).rows;
check(
  "reorder renumbers positions densely from zero",
  positionRows.length === 3 &&
    positionRows.every((row, index) => row.position === index) &&
    positionRows.map((row) => row.template_id).join(",") === reorderExpected,
);
check(
  "routine list preview follows the stored order",
  (await listRoutines(db, alice)).find((r) => r.id === reorder.id)?.exercise_names.join(",") ===
    "Alice Secret,Bench Press,Barbell Back Squat",
);
await deleteRoutine(db, alice, reorder.id);

// ---- cross-user mutation protection ---------------------------------------
await expectThrow("another user cannot update", () =>
  updateRoutine(db, bob, created.id, { title: "Hijack", notes: null, exercises: [] }),
);
await expectThrow("another user cannot delete", () => deleteRoutine(db, bob, created.id));

// ---- exercise visibility respected ----------------------------------------
await expectThrow("cannot reference another user's custom exercise", () =>
  createRoutine(db, bob, {
    title: "Thief",
    notes: null,
    exercises: [{ template_id: aliceCustom.id, rest_seconds: null, notes: null, sets: [] }],
  }),
);
check("failed create left no routine", !(await listRoutines(db, bob)).some((r) => r.title === "Thief"));

// ---- transactional rollback on failed update ------------------------------
const bobCustom = await createCustomExercise(db, bob, {
  title: "Bob Secret",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "barbell",
});
const beforeUpdate = await getRoutineTree(db, created.id, alice);
await expectThrow("failed update rolls back", () =>
  updateRoutine(db, alice, created.id, {
    title: "Should Roll Back",
    notes: null,
    exercises: [{ template_id: bobCustom.id, rest_seconds: null, notes: null, sets: [] }],
  }),
);
const afterUpdate = await getRoutineTree(db, created.id, alice);
check(
  "failed update left routine unchanged",
  afterUpdate?.title === beforeUpdate?.title && afterUpdate?.title !== "Should Roll Back",
);

// ---- invalid input (Zod) ---------------------------------------------------
check("empty title rejected", !routineInputSchema.safeParse({ title: "   ", notes: null, exercises: [] }).success);
check(
  "invalid weight rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [{ template_id: bench!.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: 5, weight_kg: "abc" }] }],
  }).success,
);
check(
  "non-uuid template rejected",
  !routineInputSchema.safeParse({ title: "x", notes: null, exercises: [{ template_id: "nope", rest_seconds: null, notes: null, sets: [] }] }).success,
);
check(
  "negative reps rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [{ template_id: bench!.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: -1, weight_kg: null }] }],
  }).success,
);
check(
  "negative duration rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [{ template_id: plank!.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: null, weight_kg: null, duration_seconds: -1 }] }],
  }).success,
);
check(
  "negative distance rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [{ template_id: running!.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: null, weight_kg: null, distance_meters: -5 }] }],
  }).success,
);
check(
  "fractional distance rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [{ template_id: running!.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: null, weight_kg: null, distance_meters: 1.5 }] }],
  }).success,
);
check(
  "negative steps rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [{ template_id: bench!.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", metrics: { steps: -1 } }] }],
  }).success,
);
check(
  "fractional floors rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [{ template_id: bench!.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", metrics: { floors: 2.5 } }] }],
  }).success,
);

// ---- supersets -------------------------------------------------------------
// A superset is two or more CONSECUTIVE exercises sharing a key. Everything else
// — a lone member, or a group split by a reorder — is stored ungrouped, so what
// the editor shows and what is persisted cannot disagree.
const supersetRoutine = await createRoutine(db, alice, {
  title: "Superset Day",
  notes: null,
  exercises: [
    { template_id: bench!.id, superset_key: "ss-a", rest_seconds: 90, notes: null, sets: [] },
    { template_id: squat!.id, superset_key: "ss-a", rest_seconds: 90, notes: null, sets: [] },
    { template_id: bench!.id, superset_key: null, rest_seconds: null, notes: null, sets: [] },
    { template_id: squat!.id, superset_key: "ss-lone", rest_seconds: null, notes: null, sets: [] },
  ],
});
const supersetKeys =
  (await getRoutineTree(db, supersetRoutine.id, alice))?.exercises.map((e) => e.superset_key) ?? [];
check(
  "a consecutive pair keeps its superset key",
  supersetKeys[0] === "ss-a" && supersetKeys[1] === "ss-a",
  supersetKeys.join(","),
);
check("an ungrouped exercise stays ungrouped", supersetKeys[2] === null);
check("a lone keyed exercise is stored ungrouped", supersetKeys[3] === null, `${supersetKeys[3]}`);

const splitRoutine = await createRoutine(db, alice, {
  title: "Split Day",
  notes: null,
  exercises: [
    { template_id: bench!.id, superset_key: "ss-x", rest_seconds: null, notes: null, sets: [] },
    { template_id: bench!.id, superset_key: null, rest_seconds: null, notes: null, sets: [] },
    { template_id: bench!.id, superset_key: "ss-x", rest_seconds: null, notes: null, sets: [] },
  ],
});
const splitKeys =
  (await getRoutineTree(db, splitRoutine.id, alice))?.exercises.map((e) => e.superset_key) ?? [];
check(
  "a group split by a reorder is stored ungrouped",
  splitKeys.length === 3 && splitKeys.every((key) => key === null),
  splitKeys.join(","),
);

await updateRoutine(db, alice, supersetRoutine.id, {
  title: "Superset Day v2",
  notes: null,
  exercises: [
    { template_id: bench!.id, superset_key: "ss-b", rest_seconds: 60, notes: null, sets: [] },
    { template_id: squat!.id, superset_key: "ss-b", rest_seconds: 60, notes: null, sets: [] },
  ],
});
const regrouped =
  (await getRoutineTree(db, supersetRoutine.id, alice))?.exercises.map((e) => e.superset_key) ?? [];
check(
  "update persists a regrouped superset",
  regrouped.length === 2 && regrouped[0] === "ss-b" && regrouped[1] === "ss-b",
  regrouped.join(","),
);

check(
  "an empty superset key is rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [{ template_id: bench!.id, superset_key: "   ", rest_seconds: null, notes: null, sets: [] }],
  }).success,
);
check(
  "an over-long superset key is rejected",
  !routineInputSchema.safeParse({
    title: "x",
    notes: null,
    exercises: [
      { template_id: bench!.id, superset_key: "s".repeat(41), rest_seconds: null, notes: null, sets: [] },
    ],
  }).success,
);

// ---- duplicate -------------------------------------------------------------
// A copy must be an INDEPENDENT tree. The proof is at the database: mutate the
// copy, then read the source back. If they shared a routine_exercise or
// routine_set row, the source would change too.
const source = await createRoutine(db, alice, {
  title: "Leg Day",
  notes: "hamstrings focus",
  exercises: [
    {
      template_id: bench!.id,
      superset_key: null,
      rest_seconds: 120,
      notes: "pause at the bottom",
      sets: [{ set_type: "normal", reps: 8, weight_kg: "80" }],
    },
  ],
});
const copy = await duplicateRoutine(db, alice, source.id);
check("duplicate returns a distinct routine", copy.id !== source.id);
check("duplicate names the copy", copy.title === "Leg Day (copy)");

const copyTree = await getRoutineTree(db, copy.id, alice);
check(
  "duplicate copies exercises and sets",
  copyTree?.exercises.length === 1 &&
    copyTree.exercises[0].template_id === bench!.id &&
    copyTree.exercises[0].sets.length === 1 &&
    copyTree.exercises[0].sets[0].set_type === "normal" &&
    copyTree.exercises[0].sets[0].reps === 8 &&
    Number(copyTree.exercises[0].sets[0].weight_kg) === 80,
);
check(
  "duplicate copies routine and exercise metadata",
  copyTree?.notes === "hamstrings focus" &&
    copyTree.exercises[0].rest_seconds === 120 &&
    copyTree.exercises[0].notes === "pause at the bottom",
);

await updateRoutine(db, alice, copy.id, {
  title: "Leg Day (copy) v2",
  notes: null,
  exercises: [
    {
      template_id: squat!.id,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "failure", reps: 5, weight_kg: "100" }],
    },
  ],
});
const sourceAfter = await getRoutineTree(db, source.id, alice);
check(
  "mutating the copy leaves the source unchanged",
  sourceAfter?.title === "Leg Day" &&
    sourceAfter.notes === "hamstrings focus" &&
    sourceAfter.exercises.length === 1 &&
    sourceAfter.exercises[0].template_id === bench!.id &&
    sourceAfter.exercises[0].sets.length === 1 &&
    Number(sourceAfter.exercises[0].sets[0].weight_kg) === 80,
);

await deleteRoutine(db, alice, copy.id);
check("deleting the copy leaves the source", (await getRoutineTree(db, source.id, alice)) !== undefined);
await deleteRoutine(db, alice, source.id);

// ---- delete own routine ----------------------------------------------------
await deleteRoutine(db, alice, created.id);
check("delete own routine", (await getRoutineTree(db, created.id, alice)) === undefined);

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
