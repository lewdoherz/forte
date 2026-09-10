import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addSet,
  finishWorkout,
  getWorkoutTree,
  listWorkouts,
  logSet,
  startWorkout,
  summarizeWorkout,
} from "../../lib/workouts";
import { createRoutine } from "../../lib/routines";
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

function bail(msg: string): never {
  failed++;
  out.push(`FAIL  ${msg}`);
  console.log(out.join("\n"));
  process.exit(1);
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
if (!bench || !squat) bail("seed fixtures present");

// ---- empty history ---------------------------------------------------------
const empty = await listWorkouts(db, alice);
check("empty history returns nothing", empty.active.length === 0 && empty.completed.length === 0);

// ---- start (active) then finish (completed) --------------------------------
const routine1 = await createRoutine(db, alice, {
  title: "Day A",
  notes: null,
  exercises: [
    { template_id: bench.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: 8, weight_kg: "80" }] },
    { template_id: squat.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: 5, weight_kg: "100" }] },
  ],
});
const w1 = await startWorkout(db, alice, routine1.id);
let list = await listWorkouts(db, alice);
check("active workout is listed as active, not history", list.active.length === 1 && list.completed.length === 0);

const tree1 = await getWorkoutTree(db, w1.id, alice);
if (!tree1) bail("workout tree exists");
await logSet(db, alice, { setId: tree1.exercises[0].sets[0].id, reps: 8, weight_kg: "82.5", rpe: "8" });
await finishWorkout(db, alice, w1.id);

list = await listWorkouts(db, alice);
check("completed workout moves to history", list.active.length === 0 && list.completed.length === 1);
check(
  "list summary counts are correct",
  list.completed[0].exercise_count === 2 &&
    list.completed[0].set_count === 2 &&
    list.completed[0].completed_set_count === 1,
  JSON.stringify(list.completed[0]),
);

// ---- ordering: newest completed first --------------------------------------
const routine2 = await createRoutine(db, alice, {
  title: "Day B",
  notes: null,
  exercises: [
    { template_id: bench.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: 5, weight_kg: "90" }] },
  ],
});
const w2 = await startWorkout(db, alice, routine2.id);
await finishWorkout(db, alice, w2.id);
list = await listWorkouts(db, alice);
check("newest completed workout appears first", list.completed[0].id === w2.id && list.completed[1].id === w1.id);

// ---- detail read -----------------------------------------------------------
const detail = await getWorkoutTree(db, w1.id, alice);
if (!detail) bail("detail tree exists");
check("detail returns the owner's workout", detail.id === w1.id && detail.owner_id === alice);
check(
  "exercise ordering is preserved",
  detail.exercises.map((e) => e.template.title).join(",") === "Bench Press,Barbell Back Squat",
);
check(
  "actual set values are retrieved",
  detail.exercises[0].sets[0].reps === 8 &&
    Number(detail.exercises[0].sets[0].weight_kg) === 82.5 &&
    Number(detail.exercises[0].sets[0].rpe) === 8,
);

// ---- cross-user isolation --------------------------------------------------
check("another user cannot view the workout", (await getWorkoutTree(db, w1.id, bob)) === undefined);
const bobList = await listWorkouts(db, bob);
check("another user's history is empty", bobList.active.length === 0 && bobList.completed.length === 0);

// ---- completed workouts are read-only server-side --------------------------
await expectThrow("cannot log a set on a completed workout", () =>
  logSet(db, alice, { setId: detail.exercises[0].sets[0].id, reps: 1, weight_kg: "1", rpe: "6" }),
);
await expectThrow("cannot add a set to a completed workout", () => addSet(db, alice, detail.exercises[0].id));
await expectThrow("cannot finish an already completed workout", () => finishWorkout(db, alice, w1.id));

// ---- derived summaries -----------------------------------------------------
await db
  .updateTable("workout")
  .set({ started_at: new Date("2026-01-01T10:00:00Z"), ended_at: new Date("2026-01-01T11:30:00Z") })
  .where("id", "=", w1.id)
  .execute();
const statsTree = await getWorkoutTree(db, w1.id, alice);
if (!statsTree) bail("stats tree exists");
const stats = summarizeWorkout(statsTree);
check("summary exerciseCount", stats.exerciseCount === 2);
check("summary totalSets", stats.totalSets === 2);
check("summary completedSets", stats.completedSets === 1);
check("summary volumeKg counts only completed sets", Math.round(stats.volumeKg) === Math.round(82.5 * 8), `${stats.volumeKg}`);
check("summary durationSeconds is exact", stats.durationSeconds === 5400, `${stats.durationSeconds}`);

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
