import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSessionSeries,
  estimateOneRepMax,
  getCompletedSetRows,
  progressQuerySchema,
  recentSession,
  summarizeProgress,
} from "../../lib/progress";
import { createCustomExercise, getVisibleExercise } from "../../lib/exercises";
import { createRoutine } from "../../lib/routines";
import { finishWorkout, getWorkoutTree, logSet, startWorkout } from "../../lib/workouts";
import type { Database } from "../../lib/db";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations") + "/";
const pglite = new PGlite();
let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
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
if (!bench) bail("bench fixture present");

// ---- one completed session: log N sets, then finish ------------------------
async function completedSession(
  userId: string,
  routineId: string,
  values: { reps: number; weight: string }[],
) {
  const workout = await startWorkout(db, userId, routineId);
  const tree = await getWorkoutTree(db, workout.id, userId);
  if (!tree) bail("session tree exists");
  for (let i = 0; i < values.length; i++) {
    await logSet(db, userId, { setId: tree.exercises[0].sets[i].id, reps: values[i].reps, weight_kg: values[i].weight });
  }
  await finishWorkout(db, userId, workout.id);
  return workout.id;
}

const benchRoutine = await createRoutine(db, alice, {
  title: "Bench Day",
  notes: null,
  exercises: [
    {
      template_id: bench.id,
      rest_seconds: null,
      notes: null,
      sets: [
        { set_type: "normal", reps: 5, weight_kg: "100" },
        { set_type: "normal", reps: 8, weight_kg: "90" },
        { set_type: "normal", reps: 3, weight_kg: "100" },
      ],
    },
  ],
});

// ---- empty history ---------------------------------------------------------
const rowsEmpty = await getCompletedSetRows(db, alice, bench.id, "all");
check("empty exercise history is handled", rowsEmpty.length === 0 && summarizeProgress(rowsEmpty).totalSets === 0);

// ---- session 1: 100×5, 90×8 -------------------------------------------------
await completedSession(alice, benchRoutine.id, [
  { reps: 5, weight: "100" },
  { reps: 8, weight: "90" },
]);
// ---- session 2: 110×3 only (2 planned sets left incomplete) -----------------
const session2 = await completedSession(alice, benchRoutine.id, [{ reps: 3, weight: "110" }]);

// ---- an active workout must be excluded ------------------------------------
const activeWorkout = await startWorkout(db, alice, benchRoutine.id);
const activeTree = await getWorkoutTree(db, activeWorkout.id, alice);
if (!activeTree) bail("active tree exists");
await logSet(db, alice, { setId: activeTree.exercises[0].sets[0].id, reps: 1, weight_kg: "200" });

const rows = await getCompletedSetRows(db, alice, bench.id, "all");
check("active workouts are excluded", !rows.some((r) => r.workoutId === activeWorkout.id));
check("incomplete sets are excluded", rows.length === 3, `rows=${rows.length}`);

const summary = summarizeProgress(rows);
check("best weight calculation", summary.bestWeightKg === 110, `${summary.bestWeightKg}`);
check("best reps calculation", summary.bestReps === 8, `${summary.bestReps}`);
check("total volume calculation", summary.totalVolumeKg === 1550, `${summary.totalVolumeKg}`);
check("session/workout count", summary.sessions === 2, `${summary.sessions}`);
check("total completed sets", summary.totalSets === 3);
check("Epley est. 1RM uses the best set", Math.round(summary.bestEstimated1RmKg ?? 0) === 121, `${summary.bestEstimated1RmKg}`);

const series = buildSessionSeries(rows);
check("session series has one point per session", series.length === 2);
check("strength series uses best weight per session", series[1].bestWeightKg === 110);
check("volume series sums weight × reps", series[0].volumeKg === 1220, `${series[0].volumeKg}`);

const recent = recentSession(rows);
check("most recent performance is the latest session", recent?.workoutId === session2 && recent.sets.length === 1);
check("most recent set values are correct", recent?.sets[0].reps === 3 && recent.sets[0].weightKg === 110);

// ---- Epley formula ---------------------------------------------------------
check("Epley 1RM formula", Math.round(estimateOneRepMax(100, 5) ?? 0) === 117);
check("Epley rejects zero weight", estimateOneRepMax(0, 5) === null);
check("Epley rejects zero reps", estimateOneRepMax(100, 0) === null);

// ---- custom exercise analytics ---------------------------------------------
const custom = await createCustomExercise(db, alice, {
  title: "Alice Machine Press",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "machine",
});
const customRoutine = await createRoutine(db, alice, {
  title: "Machine Day",
  notes: null,
  exercises: [
    { template_id: custom.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: 10, weight_kg: "50" }] },
  ],
});
await completedSession(alice, customRoutine.id, [{ reps: 10, weight: "50" }]);
const customRows = await getCompletedSetRows(db, alice, custom.id, "all");
check("user's custom exercise analytics work", summarizeProgress(customRows).bestWeightKg === 50);

// ---- ownership -------------------------------------------------------------
const bobCustom = await createCustomExercise(db, bob, {
  title: "Bob Secret Press",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "machine",
});
check("another user's custom exercise is not queryable", (await getVisibleExercise(db, bobCustom.id, alice)) === undefined);
check("system exercise is queryable by anyone", (await getVisibleExercise(db, bench.id, alice))?.id === bench.id);

const bobRows = await getCompletedSetRows(db, bob, bench.id, "all");
check("only the authenticated user's data is included", bobRows.length === 0);

// ---- date-range filtering --------------------------------------------------
const oldRoutine = await createRoutine(db, alice, {
  title: "Old Day",
  notes: null,
  exercises: [
    { template_id: bench.id, rest_seconds: null, notes: null, sets: [{ set_type: "normal", reps: 5, weight_kg: "60" }] },
  ],
});
const oldWorkout = await completedSession(alice, oldRoutine.id, [{ reps: 5, weight: "60" }]);
await db
  .updateTable("workout")
  .set({ started_at: new Date("2020-01-01T10:00:00Z"), ended_at: new Date("2020-01-01T11:00:00Z") })
  .where("id", "=", oldWorkout)
  .execute();

const recentRows = await getCompletedSetRows(db, alice, bench.id, "30d");
check("date range excludes old sessions", !recentRows.some((r) => r.workoutId === oldWorkout));
const allRows = await getCompletedSetRows(db, alice, bench.id, "all");
check("all-time includes old sessions", allRows.some((r) => r.workoutId === oldWorkout));

// ---- input validation ------------------------------------------------------
check("invalid exercise id is rejected", !progressQuerySchema.safeParse({ templateId: "not-a-uuid", range: "all" }).success);
check("invalid range is rejected", !progressQuerySchema.safeParse({ templateId: bench.id, range: "lifetime" }).success);

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
