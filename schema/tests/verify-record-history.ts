import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./harness";
import { applyMigrations, migrationFiles } from "../../scripts/apply-migrations";
import { getWorkoutRecordCounts, getWorkoutRecords, type EarnedRecord } from "../../lib/records-history";
import type { RecordCategory } from "../../lib/records";

/**
 * Records baselines.
 *
 * Every fixture is seeded with raw SQL so the times, the completion flags and
 * the routine prescriptions are exact — the interesting cases here (a set left
 * incomplete, a routine value copied onto an uncompleted set, an old workout
 * deleted later) are not states the normal write path can produce. The oracle
 * is the raw rows, so a baseline that reads the workout being evaluated, a
 * later workout, an unfinished set, another user's history or a routine
 * template fails against them.
 */
const { db, query, close, dialect } = await createTestDatabase();

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

async function expectFail(name: string, sql: string, params: unknown[] = []) {
  try {
    await query(sql, params);
  } catch {
    check(name, true);
    return;
  }
  check(name, false);
}

check(`schema migrations apply (${dialect})`, true);

// ---- migration: column, enum, default, and a no-op re-run ------------------
const appliedBefore = (
  await query<{ n: number }>(`select count(*)::int as n from schema_migrations`)
).rows[0].n;
check("every migration file is recorded as applied", appliedBefore === migrationFiles().length, `${appliedBefore}`);

const directionColumn = (
  await query<{ column_default: string | null; is_nullable: string }>(
    `select column_default, is_nullable
       from information_schema.columns
      where table_name = 'exercise_template' and column_name = 'duration_record_direction'`,
  )
).rows[0];
check(
  "duration_record_direction exists, is not null and defaults to higher",
  directionColumn !== undefined &&
    directionColumn.is_nullable === "NO" &&
    (directionColumn.column_default ?? "").includes("higher"),
  JSON.stringify(directionColumn),
);

const enumLabels = (
  await query<{ enumlabel: string }>(
    `select e.enumlabel
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
      where t.typname = 'duration_record_direction'
      order by e.enumsortorder`,
  )
).rows.map((row) => row.enumlabel);
check("the enum is exactly higher, lower, none", enumLabels.join(",") === "higher,lower,none", enumLabels.join(","));

// Re-applying an already-applied migration set must be a no-op, not an error
// and not a second insert of the same file.
await applyMigrations({ exec: (sql) => query(sql).then(() => undefined), query }, () => {});
const appliedAfter = (
  await query<{ n: number }>(`select count(*)::int as n from schema_migrations`)
).rows[0].n;
check("re-running migrations changes nothing", appliedAfter === appliedBefore, `${appliedBefore} -> ${appliedAfter}`);

const mkUser = async (email: string) =>
  (await query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;

const alice = await mkUser("alice@example.com");
const bob = await mkUser("bob@example.com");

/** A custom exercise of a chosen type; custom so each fixture is independent. */
async function mkExercise(
  ownerId: string,
  title: string,
  exerciseType: string,
  direction?: string,
): Promise<string> {
  const columns = direction ? ", duration_record_direction" : "";
  const values = direction ? ", $5::duration_record_direction" : "";
  return (
    await query<{ id: string }>(
      `insert into exercise_template
         (slug, title, exercise_type, primary_muscle, equipment, is_custom, owner_id${columns})
       values ($1, $2, $3, 'cardio', 'none', true, $4${values}) returning id`,
      direction ? [`test-${randomUUID()}`, title, exerciseType, ownerId, direction] : [`test-${randomUUID()}`, title, exerciseType, ownerId],
    )
  ).rows[0].id;
}

const storedDirection = async (id: string) =>
  (
    await query<{ duration_record_direction: string }>(
      `select duration_record_direction from exercise_template where id = $1`,
      [id],
    )
  ).rows[0].duration_record_direction;

const defaulted = await mkExercise(alice, "Defaulted direction", "duration");
check("an exercise inserted without the column reads the 'higher' default", (await storedDirection(defaulted)) === "higher");
const lowered = await mkExercise(alice, "Lowered direction", "duration", "lower");
check("'lower' is accepted and round-trips", (await storedDirection(lowered)) === "lower");
await expectFail(
  "an unknown direction is rejected",
  `update exercise_template set duration_record_direction = 'sideways' where id = $1`,
  [defaulted],
);

interface SeedSet {
  weightKg?: string;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  floors?: number;
  steps?: number;
  /** Defaults to `startedAt`; pass null to leave the set uncompleted. */
  completedAt?: Date | null;
}

interface SeedExercise {
  templateId: string;
  position: number;
  sets: SeedSet[];
}

/** Inserts a workout with its exercises and sets directly, so timestamps and completion are exact. */
async function seedWorkout(
  ownerId: string,
  title: string,
  startedAt: Date,
  exercises: SeedExercise[],
): Promise<string> {
  const workoutId = (
    await query<{ id: string }>(
      `insert into workout (owner_id, title, started_at, ended_at) values ($1, $2, $3, $3) returning id`,
      [ownerId, title, startedAt],
    )
  ).rows[0].id;

  for (const exercise of exercises) {
    const workoutExerciseId = (
      await query<{ id: string }>(
        `insert into workout_exercise (workout_id, template_id, position) values ($1, $2, $3) returning id`,
        [workoutId, exercise.templateId, exercise.position],
      )
    ).rows[0].id;

    for (const [index, set] of exercise.sets.entries()) {
      const metrics: Record<string, number> = {};
      if (set.floors !== undefined) metrics.floors = set.floors;
      if (set.steps !== undefined) metrics.steps = set.steps;
      await query(
        `insert into workout_set
           (workout_exercise_id, position, set_type, weight_kg, reps, duration_seconds, distance_meters, metrics, completed_at)
         values ($1, $2, 'normal', $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          workoutExerciseId,
          index,
          set.weightKg ?? null,
          set.reps ?? null,
          set.durationSeconds ?? null,
          set.distanceMeters ?? null,
          JSON.stringify(metrics),
          set.completedAt === undefined ? startedAt : set.completedAt,
        ],
      );
    }
  }
  return workoutId;
}

const day = (n: number) => new Date(`2026-01-${String(n).padStart(2, "0")}T10:00:00Z`);

const categoriesOf = (records: readonly EarnedRecord[]) => records.map((record) => record.category);
const byCategory = (records: readonly EarnedRecord[], category: RecordCategory) =>
  records.filter((record) => record.category === category);

// ---- strictly before, first-ever scores nothing ----------------------------
const bench = await mkExercise(alice, "Bench", "weight_reps");
const benchA = await seedWorkout(alice, "Bench A", day(1), [
  { templateId: bench, position: 0, sets: [{ weightKg: "100", reps: 5 }] },
]);
const benchB = await seedWorkout(alice, "Bench B", day(8), [
  { templateId: bench, position: 0, sets: [{ weightKg: "105", reps: 5 }] },
]);
const benchC = await seedWorkout(alice, "Bench C", day(15), [
  { templateId: bench, position: 0, sets: [{ weightKg: "104", reps: 5 }] },
]);

check("the first-ever performance earns nothing", (await getWorkoutRecords(db, alice, benchA)).length === 0);

const benchBRecords = await getWorkoutRecords(db, alice, benchB);
check(
  "a later workout is compared against the one strictly before it",
  categoriesOf(benchBRecords).join(",") === "heaviest_weight,best_e1rm,best_set_volume",
  categoriesOf(benchBRecords).join(","),
);
check(
  "a heaviest-weight record carries the value it beat",
  byCategory(benchBRecords, "heaviest_weight")[0]?.value === 105 &&
    byCategory(benchBRecords, "heaviest_weight")[0]?.previousValue === 100,
  JSON.stringify(byCategory(benchBRecords, "heaviest_weight")[0]),
);
// Equal reps against an equal-reps baseline is a tie, not a record.
check("an unchanged rep count is a tie, not a record", byCategory(benchBRecords, "most_reps").length === 0);
check("a workout that improves nothing earns nothing", (await getWorkoutRecords(db, alice, benchC)).length === 0);

// The baseline is strictly BEFORE: adding a much heavier later workout must not
// retroactively change an earlier one, and must not earn off the future.
const benchDSnapshot = categoriesOf(benchBRecords).join(",");
await seedWorkout(alice, "Bench D (later, heavier)", day(22), [
  { templateId: bench, position: 0, sets: [{ weightKg: "200", reps: 5 }] },
]);
check(
  "a later workout is never a baseline for an earlier one",
  categoriesOf(await getWorkoutRecords(db, alice, benchB)).join(",") === benchDSnapshot,
  categoriesOf(await getWorkoutRecords(db, alice, benchB)).join(","),
);
check(
  "an earlier workout still sees only its own past",
  (await getWorkoutRecords(db, alice, benchA)).length === 0,
);

// ---- one record per (exercise, category, workout) --------------------------
const collapse = await mkExercise(alice, "Collapse", "weight_reps");
await seedWorkout(alice, "Collapse baseline", day(1), [
  { templateId: collapse, position: 0, sets: [{ weightKg: "95", reps: 1 }] },
]);
const collapseWorkout = await seedWorkout(alice, "Collapse top set", day(8), [
  {
    templateId: collapse,
    position: 0,
    sets: [
      { weightKg: "80", reps: 8 },
      { weightKg: "90", reps: 5 },
      { weightKg: "100", reps: 3 },
    ],
  },
]);
const collapseRecords = await getWorkoutRecords(db, alice, collapseWorkout);
check(
  "a workout does not advance its own baseline set by set",
  byCategory(collapseRecords, "heaviest_weight").length === 1 &&
    byCategory(collapseRecords, "heaviest_weight")[0].value === 100,
  JSON.stringify(categoriesOf(collapseRecords)),
);
check(
  "the workout's best candidate per category is what is compared",
  byCategory(collapseRecords, "best_set_volume")[0]?.value === 640 &&
    byCategory(collapseRecords, "most_reps")[0]?.value === 8,
  JSON.stringify(collapseRecords),
);
check(
  "each (exercise, category) pair appears at most once",
  new Set(categoriesOf(collapseRecords)).size === collapseRecords.length && collapseRecords.length === 4,
  `${collapseRecords.length}`,
);

// ---- assisted: lower is better, and no reps category this milestone --------
const assist = await mkExercise(alice, "Assisted pull-up", "bodyweight_assisted");
await seedWorkout(alice, "Assist A", day(1), [
  { templateId: assist, position: 0, sets: [{ weightKg: "40", reps: 10 }] },
]);
const assistB = await seedWorkout(alice, "Assist B", day(8), [
  { templateId: assist, position: 0, sets: [{ weightKg: "30", reps: 8 }] },
]);
const assistRecords = await getWorkoutRecords(db, alice, assistB);
check(
  "assisted: less assistance is the record",
  categoriesOf(assistRecords).join(",") === "lowest_assistance" &&
    assistRecords[0].value === 30 &&
    assistRecords[0].previousValue === 40 &&
    assistRecords[0].direction === "lower",
  JSON.stringify(assistRecords),
);
check(
  "assisted: a lowered rep count is not compared",
  byCategory(assistRecords, "most_reps").length === 0,
);
const assistC = await seedWorkout(alice, "Assist C", day(15), [
  { templateId: assist, position: 0, sets: [{ weightKg: "45", reps: 12 }] },
]);
check(
  "assisted: more assistance and more reps earns nothing",
  (await getWorkoutRecords(db, alice, assistC)).length === 0,
);

// ---- duration direction -----------------------------------------------------
const durHigh = await mkExercise(alice, "Longer hold", "duration", "higher");
const durLow = await mkExercise(alice, "Faster sprint", "duration", "lower");
const durNone = await mkExercise(alice, "Untracked duration", "duration", "none");

await seedWorkout(alice, "Dur high A", day(1), [
  { templateId: durHigh, position: 0, sets: [{ durationSeconds: 60 }] },
]);
const durHighB = await seedWorkout(alice, "Dur high B", day(2), [
  { templateId: durHigh, position: 0, sets: [{ durationSeconds: 90 }] },
]);
check(
  "duration higher: longer earns the record",
  categoriesOf(await getWorkoutRecords(db, alice, durHighB)).join(",") === "best_duration" &&
    (await getWorkoutRecords(db, alice, durHighB))[0].direction === "higher",
);

await seedWorkout(alice, "Dur low A", day(1), [
  { templateId: durLow, position: 0, sets: [{ durationSeconds: 90 }] },
]);
const durLowB = await seedWorkout(alice, "Dur low B", day(2), [
  { templateId: durLow, position: 0, sets: [{ durationSeconds: 60 }] },
]);
check(
  "duration lower: shorter earns the record",
  categoriesOf(await getWorkoutRecords(db, alice, durLowB)).join(",") === "best_duration" &&
    (await getWorkoutRecords(db, alice, durLowB))[0].direction === "lower",
);

await seedWorkout(alice, "Dur none A", day(1), [
  { templateId: durNone, position: 0, sets: [{ durationSeconds: 60 }] },
]);
const durNoneB = await seedWorkout(alice, "Dur none B", day(2), [
  { templateId: durNone, position: 0, sets: [{ durationSeconds: 120 }] },
]);
check("duration none: no duration record at all", (await getWorkoutRecords(db, alice, durNoneB)).length === 0);

// ---- distance: pace, never raw duration across distances -------------------
const run = await mkExercise(alice, "Run", "distance_duration");
await seedWorkout(alice, "Run A", day(1), [
  { templateId: run, position: 0, sets: [{ distanceMeters: 5000, durationSeconds: 1800 }] },
]);
const runB = await seedWorkout(alice, "Run B", day(2), [
  { templateId: run, position: 0, sets: [{ distanceMeters: 6000, durationSeconds: 1500 }] },
]);
const runBRecords = await getWorkoutRecords(db, alice, runB);
check(
  "distance: furthest and fastest are independent records",
  categoriesOf(runBRecords).join(",") === "longest_distance,best_pace",
  categoriesOf(runBRecords).join(","),
);
check(
  "distance: pace is distance/duration",
  Math.abs((byCategory(runBRecords, "best_pace")[0]?.value ?? 0) - 4) < 1e-12,
  `${byCategory(runBRecords, "best_pace")[0]?.value}`,
);
// A short, fast effort: raw duration drops below the baseline (a "shorter"
// duration would be a record), but duration is not a category here — only the
// improved pace is.
const runC = await seedWorkout(alice, "Run C", day(3), [
  { templateId: run, position: 0, sets: [{ distanceMeters: 1000, durationSeconds: 200 }] },
]);
const runCRecords = await getWorkoutRecords(db, alice, runC);
check(
  "distance: raw duration is never compared across distances",
  categoriesOf(runCRecords).join(",") === "best_pace" &&
    !categoriesOf(runCRecords).includes("best_duration") &&
    !categoriesOf(runCRecords).includes("longest_duration"),
  categoriesOf(runCRecords).join(","),
);

// ---- weight_duration: two independent categories ---------------------------
const carry = await mkExercise(alice, "Farmer carry", "weight_duration");
await seedWorkout(alice, "Carry A", day(1), [
  { templateId: carry, position: 0, sets: [{ weightKg: "50", durationSeconds: 30 }] },
]);
const carryB = await seedWorkout(alice, "Carry B", day(2), [
  { templateId: carry, position: 0, sets: [{ weightKg: "60", durationSeconds: 25 }] },
]);
check(
  "weight_duration: heavier without longer earns only the weight record",
  categoriesOf(await getWorkoutRecords(db, alice, carryB)).join(",") === "heaviest_weight",
  categoriesOf(await getWorkoutRecords(db, alice, carryB)).join(","),
);
const carryC = await seedWorkout(alice, "Carry C", day(3), [
  { templateId: carry, position: 0, sets: [{ weightKg: "55", durationSeconds: 40 }] },
]);
check(
  "weight_duration: longer without heavier earns only the duration record",
  categoriesOf(await getWorkoutRecords(db, alice, carryC)).join(",") === "longest_duration",
  categoriesOf(await getWorkoutRecords(db, alice, carryC)).join(","),
);

// ---- count categories and their derived rates ------------------------------
const stairs = await mkExercise(alice, "Stairs", "floors_duration");
await seedWorkout(alice, "Stairs A", day(1), [
  { templateId: stairs, position: 0, sets: [{ floors: 20, durationSeconds: 300 }] },
]);
const stairsB = await seedWorkout(alice, "Stairs B", day(2), [
  { templateId: stairs, position: 0, sets: [{ floors: 30, durationSeconds: 600 }] },
]);
check(
  "floors: more floors with a worse rate earns only most_floors",
  categoriesOf(await getWorkoutRecords(db, alice, stairsB)).join(",") === "most_floors",
  categoriesOf(await getWorkoutRecords(db, alice, stairsB)).join(","),
);
// 40 floors in 600s is exactly the 4/min baseline set by Stairs A: an exact tie
// on a metric derived by division must not become a record.
const stairsC = await seedWorkout(alice, "Stairs C", day(3), [
  { templateId: stairs, position: 0, sets: [{ floors: 40, durationSeconds: 600 }] },
]);
const stairsCRecords = await getWorkoutRecords(db, alice, stairsC);
check(
  "an exact tie on a computed rate is not a record",
  categoriesOf(stairsCRecords).join(",") === "most_floors",
  categoriesOf(stairsCRecords).join(","),
);

const stepMill = await mkExercise(alice, "Step mill", "steps_duration");
await seedWorkout(alice, "Steps A", day(1), [
  { templateId: stepMill, position: 0, sets: [{ steps: 1000, durationSeconds: 300 }] },
]);
const stepsB = await seedWorkout(alice, "Steps B", day(2), [
  { templateId: stepMill, position: 0, sets: [{ steps: 1500, durationSeconds: 300 }] },
]);
check(
  "steps: more steps and a faster rate are two records",
  categoriesOf(await getWorkoutRecords(db, alice, stepsB)).join(",") === "most_steps,best_steps_per_minute",
  categoriesOf(await getWorkoutRecords(db, alice, stepsB)).join(","),
);

// ---- e1RM: a single is the load, and above 12 reps none is computed --------
const single = await mkExercise(alice, "Single", "weight_reps");
await seedWorkout(alice, "Single A", day(1), [
  { templateId: single, position: 0, sets: [{ weightKg: "100", reps: 1 }] },
]);
const singleB = await seedWorkout(alice, "Single B", day(2), [
  { templateId: single, position: 0, sets: [{ weightKg: "101", reps: 1 }] },
]);
const singleRecords = await getWorkoutRecords(db, alice, singleB);
check(
  "a one-rep set's e1RM is its weight, not Epley's inflation",
  byCategory(singleRecords, "best_e1rm")[0]?.value === 101 &&
    byCategory(singleRecords, "best_e1rm")[0]?.previousValue === 100,
  JSON.stringify(byCategory(singleRecords, "best_e1rm")[0]),
);

const highRep = await mkExercise(alice, "High rep", "weight_reps");
await seedWorkout(alice, "High rep A", day(1), [
  { templateId: highRep, position: 0, sets: [{ weightKg: "50", reps: 20 }] },
]);
const highRepB = await seedWorkout(alice, "High rep B", day(2), [
  { templateId: highRep, position: 0, sets: [{ weightKg: "55", reps: 20 }] },
]);
const highRepRecords = await getWorkoutRecords(db, alice, highRepB);
check(
  "above 12 reps no e1RM record exists",
  !categoriesOf(highRepRecords).includes("best_e1rm") &&
    categoriesOf(highRepRecords).join(",") === "heaviest_weight,best_set_volume",
  categoriesOf(highRepRecords).join(","),
);

// ---- zero and missing loads never qualify ----------------------------------
const zero = await mkExercise(alice, "Zero load", "weight_reps");
await seedWorkout(alice, "Zero A", day(1), [
  { templateId: zero, position: 0, sets: [{ weightKg: "0", reps: 10 }] },
]);
const zeroB = await seedWorkout(alice, "Zero B", day(2), [
  { templateId: zero, position: 0, sets: [{ weightKg: "0", reps: 12 }] },
]);
check(
  "a zero load is never a weight, e1RM or volume record",
  categoriesOf(await getWorkoutRecords(db, alice, zeroB)).join(",") === "most_reps",
  categoriesOf(await getWorkoutRecords(db, alice, zeroB)).join(","),
);

// ---- incomplete sets and routine prescriptions are invisible ----------------
const prescribed = await mkExercise(alice, "Prescribed", "weight_reps");
await seedWorkout(alice, "Prescribed real", day(1), [
  { templateId: prescribed, position: 0, sets: [{ weightKg: "100", reps: 5 }] },
]);
// A routine whose template prescribes far more than the user has lifted.
const routineId = (
  await query<{ id: string }>(
    `insert into routine (owner_id, title) values ($1, 'Heavy plan') returning id`,
    [alice],
  )
).rows[0].id;
const routineExerciseId = (
  await query<{ id: string }>(
    `insert into routine_exercise (routine_id, template_id, position) values ($1, $2, 0) returning id`,
    [routineId, prescribed],
  )
).rows[0].id;
await query(`insert into routine_set (routine_exercise_id, position, set_type, weight_kg, reps) values ($1, 0, 'normal', 500, 5)`, [
  routineExerciseId,
]);
// The started workout copies the prescription onto its sets; they stay
// uncompleted. Its one completed set is a real 110.
const prescribedB = await seedWorkout(alice, "Prescribed started", day(2), [
  {
    templateId: prescribed,
    position: 0,
    sets: [
      { weightKg: "500", reps: 5, completedAt: null },
      { weightKg: "110", reps: 5 },
    ],
  },
]);
check(
  "a routine prescription on an uncompleted set never qualifies",
  byCategory(await getWorkoutRecords(db, alice, prescribedB), "heaviest_weight")[0]?.value === 110,
  JSON.stringify(await getWorkoutRecords(db, alice, prescribedB)),
);
// A later real workout must also not see the prescribed 500 as a baseline.
const prescribedC = await seedWorkout(alice, "Prescribed later", day(3), [
  { templateId: prescribed, position: 0, sets: [{ weightKg: "150", reps: 5 }] },
]);
check(
  "a prescription never becomes a baseline for a later workout",
  categoriesOf(await getWorkoutRecords(db, alice, prescribedC)).includes("heaviest_weight"),
  categoriesOf(await getWorkoutRecords(db, alice, prescribedC)).join(","),
);

// ---- ownership -------------------------------------------------------------
const shared = await mkExercise(alice, "Owned by alice", "weight_reps");
await seedWorkout(alice, "Alice real", day(1), [
  { templateId: shared, position: 0, sets: [{ weightKg: "100", reps: 5 }] },
]);
// Bob references the same template and posts a much heavier effort before
// alice's next workout; it must be invisible to her.
const bobWorkout = await seedWorkout(bob, "Bob huge", day(2), [
  { templateId: shared, position: 0, sets: [{ weightKg: "500", reps: 5 }] },
]);
const aliceAfterBob = await seedWorkout(alice, "Alice later", day(3), [
  { templateId: shared, position: 0, sets: [{ weightKg: "105", reps: 5 }] },
]);
check(
  "another user's history is never a baseline",
  byCategory(await getWorkoutRecords(db, alice, aliceAfterBob), "heaviest_weight")[0]?.previousValue === 100,
  JSON.stringify(byCategory(await getWorkoutRecords(db, alice, aliceAfterBob), "heaviest_weight")[0]),
);
check("bob's own first-ever effort is not a record for him", (await getWorkoutRecords(db, bob, bobWorkout)).length === 0);

// ---- determinism and count keying ------------------------------------------
const repeatA = JSON.stringify(await getWorkoutRecords(db, alice, benchB));
const repeatB = JSON.stringify(await getWorkoutRecords(db, alice, benchB));
check("re-running the derivation for the same history is identical", repeatA === repeatB, repeatA);

const pageCounts = await getWorkoutRecordCounts(db, alice, [benchA, benchB, benchC, "00000000-0000-0000-0000-000000000000"]);
check(
  "counts are keyed by workout id and cover every requested workout",
  pageCounts.get(benchA) === 0 &&
    pageCounts.get(benchB) === 3 &&
    pageCounts.get(benchC) === 0 &&
    pageCounts.size === 4,
  JSON.stringify([...pageCounts.entries()]),
);
check("an unknown workout id still maps to zero", pageCounts.get("00000000-0000-0000-0000-000000000000") === 0);
check("an empty page yields an empty map", (await getWorkoutRecordCounts(db, alice, [])).size === 0);
check(
  "a page count equals the length of the same workout's records",
  pageCounts.get(benchB) === (await getWorkoutRecords(db, alice, benchB)).length,
);

// ---- deleting an old workout recalculates later ones ------------------------
const recalc = await mkExercise(alice, "Recalc", "weight_reps");
const recalcOld = await seedWorkout(alice, "Recalc old", day(1), [
  { templateId: recalc, position: 0, sets: [{ weightKg: "100", reps: 5 }] },
]);
const recalcMid = await seedWorkout(alice, "Recalc mid", day(2), [
  { templateId: recalc, position: 0, sets: [{ weightKg: "90", reps: 5 }] },
]);
const recalcNew = await seedWorkout(alice, "Recalc new", day(3), [
  { templateId: recalc, position: 0, sets: [{ weightKg: "95", reps: 5 }] },
]);
const beforeDelete = await getWorkoutRecordCounts(db, alice, [recalcMid, recalcNew]);
check(
  "before the delete, the old best suppresses both later workouts",
  beforeDelete.get(recalcMid) === 0 && beforeDelete.get(recalcNew) === 0,
  JSON.stringify([...beforeDelete.entries()]),
);

await query(`delete from workout where id = $1`, [recalcOld]);
const afterDelete = await getWorkoutRecordCounts(db, alice, [recalcMid, recalcNew]);
check(
  "after deleting the old workout, the later one recalculates against what remains",
  afterDelete.get(recalcMid) === 0 && afterDelete.get(recalcNew) === 3,
  JSON.stringify([...afterDelete.entries()]),
);
check(
  "the recalculated records name the new baseline",
  byCategory(await getWorkoutRecords(db, alice, recalcNew), "heaviest_weight")[0]?.previousValue === 90,
  JSON.stringify(byCategory(await getWorkoutRecords(db, alice, recalcNew), "heaviest_weight")[0]),
);

await close();

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
