import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCustomExercise,
  deleteCustomExercise,
  exerciseInputSchema,
  getVisibleExercise,
  listExercises,
  updateCustomExercise,
} from "../../lib/exercises";
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

// ---- read: system exercises are visible ----------------------------------
const all = await listExercises(db, alice);
check("system exercises seeded and readable", all.length >= 20, `n=${all.length}`);
check("seeded exercises are system rows", all.every((e) => !e.is_custom));

// ---- search ---------------------------------------------------------------
const search = await listExercises(db, alice, { q: "BENCH" });
check(
  "search is case-insensitive on title",
  search.length > 0 && search.every((e) => e.title.toLowerCase().includes("bench")),
  search.map((e) => e.title).join(","),
);

// ---- filters --------------------------------------------------------------
const chest = await listExercises(db, alice, { muscle: "chest" });
check("filter by primary muscle", chest.length > 0 && chest.every((e) => e.primary_muscle === "chest"));

const barbell = await listExercises(db, alice, { equipment: "barbell" });
check("filter by equipment", barbell.length > 0 && barbell.every((e) => e.equipment === "barbell"));

// ---- create custom exercise -----------------------------------------------
const created = await createCustomExercise(db, alice, {
  title: "My Custom Lift",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: ["triceps"],
  equipment: "barbell",
});
check("custom exercise is_custom and owned by creator", created.is_custom === true && created.owner_id === alice);

// ---- visibility / ownership -----------------------------------------------
check("owner can read own custom exercise", (await getVisibleExercise(db, created.id, alice))?.id === created.id);
check("other user cannot read custom exercise", (await getVisibleExercise(db, created.id, bob)) === undefined);

const edit = {
  title: "Hijack",
  exercise_type: "weight_reps" as const,
  primary_muscle: "chest",
  secondary_muscles: [] as string[],
  equipment: "barbell",
};
await expectThrow("user cannot update another's exercise", () => updateCustomExercise(db, bob, created.id, edit));
await expectThrow("user cannot delete another's exercise", () => deleteCustomExercise(db, bob, created.id));

const sys = all.find((e) => !e.is_custom);
check("found a system exercise", !!sys);
if (sys) {
  await expectThrow("system exercise cannot be updated", () => updateCustomExercise(db, alice, sys.id, edit));
  await expectThrow("system exercise cannot be deleted", () => deleteCustomExercise(db, alice, sys.id));
}

// ---- owner can update + delete own ----------------------------------------
const updated = await updateCustomExercise(db, alice, created.id, {
  title: "Updated Lift",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "dumbbell",
});
check("owner can update own exercise", updated.title === "Updated Lift" && updated.equipment === "dumbbell");

await deleteCustomExercise(db, alice, created.id);
check("owner can delete own exercise", (await getVisibleExercise(db, created.id, alice)) === undefined);

// ---- invalid input (Zod) --------------------------------------------------
check(
  "invalid exercise_type rejected",
  !exerciseInputSchema.safeParse({ title: "x", exercise_type: "not_a_type", primary_muscle: "chest", equipment: "barbell" }).success,
);
check(
  "empty title rejected",
  !exerciseInputSchema.safeParse({ title: "   ", exercise_type: "weight_reps", primary_muscle: "chest", equipment: "barbell" }).success,
);

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
