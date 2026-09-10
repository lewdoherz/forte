import {
  createCustomExercise,
  deleteCustomExercise,
  exerciseInputSchema,
  getVisibleExercise,
  listExercises,
  updateCustomExercise,
} from "../../lib/exercises";
import { createRoutine, getRoutineTree } from "../../lib/routines";
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

// ---- an exercise referenced by history is archived, never silently kept ----
// routine_exercise.template_id is NO ACTION, so a hard delete would raise a
// foreign-key error. Deleting must still work, and must leave the reference
// resolvable.
const inUse = await createCustomExercise(db, alice, {
  title: "In Use Lift",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "barbell",
});
const inUseRoutine = await createRoutine(db, alice, {
  title: "References a custom lift",
  notes: null,
  exercises: [
    {
      template_id: inUse.id,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5, weight_kg: "20" }],
    },
  ],
});

await deleteCustomExercise(db, alice, inUse.id);

check(
  "deleting an in-use exercise removes it from the owner's library",
  (await getVisibleExercise(db, inUse.id, alice)) === undefined,
);
check(
  "deleting an in-use exercise removes it from the owner's list",
  !(await listExercises(db, alice)).some((e) => e.id === inUse.id),
);
check(
  "the routine referencing it still resolves",
  (await getRoutineTree(db, inUseRoutine.id, alice))?.exercises[0].template.title === "In Use Lift",
);

// ---- invalid input (Zod) --------------------------------------------------
check(
  "invalid exercise_type rejected",
  !exerciseInputSchema.safeParse({ title: "x", exercise_type: "not_a_type", primary_muscle: "chest", equipment: "barbell" }).success,
);
check(
  "empty title rejected",
  !exerciseInputSchema.safeParse({ title: "   ", exercise_type: "weight_reps", primary_muscle: "chest", equipment: "barbell" }).success,
);

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
