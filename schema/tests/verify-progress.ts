import { createTestDatabase } from "./harness";
import {
  estimateOneRepMax,
  getProgressSummary,
  getRecentSession,
  getSessionSeries,
  progressQuerySchema,
  rangeStart,
  type ProgressRange,
} from "../../lib/progress";
import { createCustomExercise, getVisibleExercise } from "../../lib/exercises";
import { createRoutine } from "../../lib/routines";
import { finishWorkout, getWorkoutTree, logSet, startWorkout } from "../../lib/workouts";

/**
 * Progress analytics.
 *
 * The aggregations run in SQL. To keep that honest, this suite does two
 * independent things:
 *   1. it pins the expected numbers absolutely, and
 *   2. it re-derives them with a test-local fold over the raw completed sets
 *      (the shape the previous implementation consumed) and asserts the SQL
 *      agrees. A test-local oracle is used rather than keeping the old
 *      implementation in the application, so the shipped code has a single
 *      implementation while the semantics still have an independent check.
 */
const { db, query, close, dialect } = await createTestDatabase();

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

check(`schema migrations apply (${dialect})`, true);

const mkUser = async (email: string) =>
  (await query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;

const alice = await mkUser("alice@example.com");
const bob = await mkUser("bob@example.com");

const sys = await db.selectFrom("exercise_template").selectAll().where("is_custom", "=", false).execute();
const bench = sys.find((e) => e.title === "Bench Press");
if (!bench) bail("bench fixture present");

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

// ---- test-local oracle: the raw completed sets, folded in JavaScript --------
interface RawSet {
  workoutId: string;
  startedAt: Date;
  reps: number | null;
  weightKg: number | null;
}

async function rawCompletedSets(
  userId: string,
  templateId: string,
  range: ProgressRange,
): Promise<RawSet[]> {
  const since = rangeStart(range, new Date(), "UTC");
  const result = await query<{
    workout_id: string;
    started_at: Date;
    reps: number | null;
    weight_kg: string | null;
  }>(
    `select w.id as workout_id, w.started_at, ws.reps, ws.weight_kg
       from workout_set ws
       join workout_exercise we on we.id = ws.workout_exercise_id
       join workout w on w.id = we.workout_id
      where w.owner_id = $1
        and w.ended_at is not null
        and ws.completed_at is not null
        and we.template_id = $2
        and ($3::timestamptz is null or w.started_at >= $3::timestamptz)
      order by w.started_at asc, ws.position asc`,
    [userId, templateId, since],
  );

  return result.rows.map((row) => ({
    workoutId: row.workout_id,
    startedAt: row.started_at,
    reps: row.reps,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
  }));
}

function oracleSummary(rows: RawSet[]) {
  let bestWeightKg: number | null = null;
  let bestReps: number | null = null;
  let totalVolumeKg = 0;
  let bestEstimated1RmKg: number | null = null;
  const workouts = new Set<string>();

  for (const row of rows) {
    workouts.add(row.workoutId);
    if (row.weightKg != null && (bestWeightKg == null || row.weightKg > bestWeightKg)) {
      bestWeightKg = row.weightKg;
    }
    if (row.reps != null && (bestReps == null || row.reps > bestReps)) {
      bestReps = row.reps;
    }
    if (row.weightKg != null && row.reps != null) {
      totalVolumeKg += row.weightKg * row.reps;
      const e1rm = estimateOneRepMax(row.weightKg, row.reps);
      if (e1rm != null && (bestEstimated1RmKg == null || e1rm > bestEstimated1RmKg)) {
        bestEstimated1RmKg = e1rm;
      }
    }
  }

  return {
    bestWeightKg,
    bestReps,
    totalSets: rows.length,
    totalVolumeKg,
    sessions: workouts.size,
    bestEstimated1RmKg,
  };
}

function oracleSeries(rows: RawSet[]) {
  const byWorkout = new Map<
    string,
    { workoutId: string; date: Date; bestWeightKg: number | null; volumeKg: number; sets: number }
  >();

  for (const row of rows) {
    let point = byWorkout.get(row.workoutId);
    if (!point) {
      point = { workoutId: row.workoutId, date: row.startedAt, bestWeightKg: null, volumeKg: 0, sets: 0 };
      byWorkout.set(row.workoutId, point);
    }
    point.sets += 1;
    if (row.weightKg != null && (point.bestWeightKg == null || row.weightKg > point.bestWeightKg)) {
      point.bestWeightKg = row.weightKg;
    }
    if (row.weightKg != null && row.reps != null) {
      point.volumeKg += row.weightKg * row.reps;
    }
  }

  return [...byWorkout.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

const near = (a: number | null, b: number | null) =>
  a == null || b == null ? a === b : Math.abs(a - b) < 1e-6;

// ---- empty history ---------------------------------------------------------
const emptySummary = await getProgressSummary(db, alice, bench.id, "all");
check("empty exercise history is handled", emptySummary.totalSets === 0 && emptySummary.bestWeightKg === null);
check("empty history yields no session series", (await getSessionSeries(db, alice, bench.id, "all")).length === 0);
check("empty history yields no recent session", (await getRecentSession(db, alice, bench.id, "all")) === null);

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

const summary = await getProgressSummary(db, alice, bench.id, "all");
check("best weight calculation", summary.bestWeightKg === 110, `${summary.bestWeightKg}`);
check("best reps calculation", summary.bestReps === 8, `${summary.bestReps}`);
check("total volume calculation", summary.totalVolumeKg === 1550, `${summary.totalVolumeKg}`);
check("session/workout count", summary.sessions === 2, `${summary.sessions}`);
check("total completed sets", summary.totalSets === 3);
check(
  "Epley est. 1RM uses the best set",
  Math.round(summary.bestEstimated1RmKg ?? 0) === 121,
  `${summary.bestEstimated1RmKg}`,
);

const series = await getSessionSeries(db, alice, bench.id, "all");
check("session series has one point per session", series.length === 2);
check("strength series uses best weight per session", series[1].bestWeightKg === 110);
check("volume series sums weight × reps", series[0].volumeKg === 1220, `${series[0].volumeKg}`);

const recent = await getRecentSession(db, alice, bench.id, "all");
check("most recent performance is the latest session", recent?.workoutId === session2 && recent.sets.length === 1);
check("most recent set values are correct", recent?.sets[0].reps === 3 && recent.sets[0].weightKg === 110);
check("active workouts are excluded", !series.some((s) => s.workoutId === activeWorkout.id));

// ---- differential check against the test-local oracle ----------------------
const raw = await rawCompletedSets(alice, bench.id, "all");
const expected = oracleSummary(raw);
const expectedSeries = oracleSeries(raw);

check(
  "SQL summary agrees with the row-wise oracle",
  near(summary.bestWeightKg, expected.bestWeightKg) &&
    near(summary.bestReps, expected.bestReps) &&
    summary.totalSets === expected.totalSets &&
    near(summary.totalVolumeKg, expected.totalVolumeKg) &&
    summary.sessions === expected.sessions &&
    near(summary.bestEstimated1RmKg, expected.bestEstimated1RmKg),
  `sql=${JSON.stringify(summary)} oracle=${JSON.stringify(expected)}`,
);
check(
  "SQL session series agrees with the row-wise oracle",
  series.length === expectedSeries.length &&
    series.every(
      (point, i) =>
        point.workoutId === expectedSeries[i].workoutId &&
        near(point.bestWeightKg, expectedSeries[i].bestWeightKg) &&
        near(point.volumeKg, expectedSeries[i].volumeKg) &&
        point.sets === expectedSeries[i].sets,
    ),
);

// ---- boundedness -----------------------------------------------------------
// The series is the only multi-row result. Adding 40 sets inside ONE session
// must grow the summary totals but leave the series length unchanged, proving
// its size is bounded by sessions rather than sets.
const bulkRoutine = await createRoutine(db, alice, {
  title: "Bulk Day",
  notes: null,
  exercises: [
    {
      template_id: bench.id,
      rest_seconds: null,
      notes: null,
      sets: Array.from({ length: 40 }, () => ({ set_type: "normal" as const, reps: 5, weight_kg: "50" })),
    },
  ],
});
const beforeBulk = await getProgressSummary(db, alice, bench.id, "all");
const beforeSeries = await getSessionSeries(db, alice, bench.id, "all");

await completedSession(
  alice,
  bulkRoutine.id,
  Array.from({ length: 40 }, () => ({ reps: 5, weight: "50" })),
);

const afterBulk = await getProgressSummary(db, alice, bench.id, "all");
const afterSeries = await getSessionSeries(db, alice, bench.id, "all");

check(
  "40 sets in one session grow the totals by exactly 40",
  afterBulk.totalSets === beforeBulk.totalSets + 40,
  `${beforeBulk.totalSets} -> ${afterBulk.totalSets}`,
);
check(
  "the session series grows by one point, not by 40",
  afterSeries.length === beforeSeries.length + 1,
  `${beforeSeries.length} -> ${afterSeries.length}`,
);

// ---- Epley formula ---------------------------------------------------------
check("Epley 1RM formula", Math.round(estimateOneRepMax(100, 5) ?? 0) === 117);
check("Epley rejects zero weight", estimateOneRepMax(0, 5) === null);
check("Epley rejects zero reps", estimateOneRepMax(100, 0) === null);

// ---- a zero-weight set must not manufacture a 1RM ---------------------------
// estimateOneRepMax returns null unless both values are positive; the SQL guard
// has to match, or a bodyweight set would report an estimated 1RM of 0. This
// needs its own exercise so the aggregate contains nothing but zero-weight sets.
const zeroExercise = await createCustomExercise(db, alice, {
  title: "Alice Zero Load",
  exercise_type: "weight_reps",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "machine",
});
const zeroRoutine = await createRoutine(db, alice, {
  title: "Zero Day",
  notes: null,
  exercises: [
    {
      template_id: zeroExercise.id,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 10, weight_kg: "0" }],
    },
  ],
});
await completedSession(alice, zeroRoutine.id, [{ reps: 10, weight: "0" }]);

const zeroSummary = await getProgressSummary(db, alice, zeroExercise.id, "all");
check(
  "a zero-weight set reports no estimated 1RM",
  zeroSummary.totalSets === 1 && zeroSummary.bestEstimated1RmKg === null,
  `sets=${zeroSummary.totalSets} e1rm=${zeroSummary.bestEstimated1RmKg}`,
);
check("a zero-weight set contributes no volume", zeroSummary.totalVolumeKg === 0, `${zeroSummary.totalVolumeKg}`);

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
const customSummary = await getProgressSummary(db, alice, custom.id, "all");
check("user's custom exercise analytics work", customSummary.bestWeightKg === 50);

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

const bobSummary = await getProgressSummary(db, bob, bench.id, "all");
check("only the authenticated user's data is included", bobSummary.totalSets === 0, `${bobSummary.totalSets}`);
check("another user sees no session series", (await getSessionSeries(db, bob, bench.id, "all")).length === 0);
check("another user sees no recent session", (await getRecentSession(db, bob, bench.id, "all")) === null);

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

const recentSeries = await getSessionSeries(db, alice, bench.id, "30d");
check("date range excludes old sessions", !recentSeries.some((s) => s.workoutId === oldWorkout));
const allSeries = await getSessionSeries(db, alice, bench.id, "all");
check("all-time includes old sessions", allSeries.some((s) => s.workoutId === oldWorkout));

const rangedRaw = await rawCompletedSets(alice, bench.id, "30d");
const rangedSummary = await getProgressSummary(db, alice, bench.id, "30d");
check(
  "a ranged summary agrees with the oracle over the same window",
  near(rangedSummary.totalVolumeKg, oracleSummary(rangedRaw).totalVolumeKg) &&
    rangedSummary.totalSets === rangedRaw.length,
);

// ---- input validation ------------------------------------------------------
check("invalid exercise id is rejected", !progressQuerySchema.safeParse({ templateId: "not-a-uuid", range: "all" }).success);
check("invalid range is rejected", !progressQuerySchema.safeParse({ templateId: bench.id, range: "lifetime" }).success);

await close();

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
