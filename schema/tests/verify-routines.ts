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
