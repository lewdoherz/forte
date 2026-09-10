import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRoutine,
  deleteRoutine,
  getRoutineTree,
  listRoutines,
  routineInputSchema,
  updateRoutine,
} from "../../lib/routines";
import { createCustomExercise } from "../../lib/exercises";
import type { Database } from "../../lib/db";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations") + "/";
const pglite = new PGlite();
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

for (const f of ["0001_init.sql", "0002_seed_vocabularies.sql", "0003_social.sql", "0004_auth.sql", "0005_seed_exercises.sql"]) {
  await pglite.exec(readFileSync(MIG + f, "utf8"));
}
check("0001-0005 apply", true);

const db = new Kysely<Database>({ dialect: new PGliteDialect({ pglite }) });

const mkUser = async (email: string) =>
  (await pglite.query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;

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

// ---- delete own routine ----------------------------------------------------
await deleteRoutine(db, alice, created.id);
check("delete own routine", (await getRoutineTree(db, created.id, alice)) === undefined);

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
