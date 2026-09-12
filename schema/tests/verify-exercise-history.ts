import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./harness";
import { getExerciseHistory } from "../../lib/exercise-history";
import { formatSetValues } from "../../lib/workout-stats";
import { EXERCISE_TYPES, type ExerciseType } from "../../schema/types";

/**
 * The exercise History tab's read.
 *
 * Every fixture is seeded with raw SQL so the timestamps, the completion flags
 * and the set positions are exact — the cases that matter here (an incomplete
 * set, two occurrences of one exercise in a workout, a workout left with only
 * an unfinished set, an old workout deleted later) are not states the normal
 * write path produces. The oracle is the raw rows, so a read that includes an
 * unfinished set, drops a completed one, misorders sessions or loses the
 * exercise/record association fails against them.
 */
const { db, query, close, dialect } = await createTestDatabase();

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

check(`schema migrations apply (${dialect})`, true);

const mkUser = async (email: string) =>
  (await query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;

const alice = await mkUser("alice@example.com");
const bob = await mkUser("bob@example.com");

/** A custom exercise of a chosen type, so each fixture is independent. */
async function mkExercise(ownerId: string, title: string, exerciseType: ExerciseType): Promise<string> {
  return (
    await query<{ id: string }>(
      `insert into exercise_template
         (slug, title, exercise_type, primary_muscle, equipment, is_custom, owner_id)
       values ($1, $2, $3, 'cardio', 'none', true, $4) returning id`,
      [`test-${randomUUID()}`, title, exerciseType, ownerId],
    )
  ).rows[0].id;
}

interface SeedSet {
  weightKg?: string;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  floors?: number;
  steps?: number;
  rpe?: string;
  setType?: string;
  /** Defaults to `startedAt`; pass null to leave the set uncompleted. */
  completedAt?: Date | null;
}

interface SeedExercise {
  templateId: string;
  position: number;
  sets: SeedSet[];
}

/** Inserts a workout with its exercises and sets directly, so positions and completion are exact. */
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
           (workout_exercise_id, position, set_type, weight_kg, reps, duration_seconds, distance_meters, rpe, metrics, completed_at)
         values ($1, $2, $3::set_type, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
        [
          workoutExerciseId,
          index,
          set.setType ?? "normal",
          set.weightKg ?? null,
          set.reps ?? null,
          set.durationSeconds ?? null,
          set.distanceMeters ?? null,
          set.rpe ?? null,
          JSON.stringify(metrics),
          set.completedAt === undefined ? startedAt : set.completedAt,
        ],
      );
    }
  }
  return workoutId;
}

/** January of a fixed year; `n` up to 31, so ISO parsing never rolls a date over. */
const day = (n: number) => new Date(Date.UTC(2026, 0, n, 10, 0, 0));

const categoriesOf = (session: { records: readonly string[] } | undefined) =>
  session?.records.join(",") ?? "<missing>";

const bench = await mkExercise(alice, "Bench", "weight_reps");
const other = await mkExercise(alice, "Other", "weight_reps");
const order = await mkExercise(alice, "Order", "weight_reps");
const alpha = await mkExercise(alice, "Alpha", "weight_reps");
const beta = await mkExercise(alice, "Beta", "weight_reps");
const del = await mkExercise(alice, "Delete me", "weight_reps");

// ---- ordering, association, set order, incomplete sets ----------------------
const benchA = await seedWorkout(alice, "Bench day 1", day(1), [
  {
    templateId: bench,
    position: 0,
    sets: [
      { weightKg: "100", reps: 5 },
      // The logger copies a routine's prescription onto an unfinished set; it
      // carries a distinctive weight so a leak into the read is unmistakable.
      { weightKg: "999", reps: 1, completedAt: null },
    ],
  },
]);
const benchB = await seedWorkout(alice, "Bench day 2", day(2), [
  { templateId: bench, position: 0, sets: [{ weightKg: "105", reps: 5 }] },
]);
const benchC = await seedWorkout(alice, "Bench day 3", day(3), [
  { templateId: bench, position: 0, sets: [{ weightKg: "105", reps: 5 }] },
]);

const benchHistory = await getExerciseHistory(db, alice, bench);
check("the exercise's type is returned with the sessions", benchHistory.exerciseType === "weight_reps");
check(
  "sessions are newest first",
  benchHistory.sessions.map((s) => s.title).join(",") === "Bench day 3,Bench day 2,Bench day 1",
  benchHistory.sessions.map((s) => s.title).join(","),
);
check(
  "each session is associated with its own workout and date",
  benchHistory.sessions[2]?.workoutId === benchA &&
    benchHistory.sessions[2]?.date.getTime() === day(1).getTime() &&
    benchHistory.sessions[1]?.workoutId === benchB &&
    benchHistory.sessions[0]?.workoutId === benchC,
);
check(
  "an incomplete set is not part of a session",
  benchHistory.sessions[2]?.sets.length === 1 &&
    formatSetValues(benchHistory.sessions[2].sets[0], "weight_reps") === "100 kg × 5 reps",
  JSON.stringify(benchHistory.sessions[2]?.sets),
);
check(
  "the session list is bounded by the limit",
  (await getExerciseHistory(db, alice, bench, 2)).sessions.map((s) => s.title).join(",") ===
    "Bench day 3,Bench day 2",
);

// ---- two occurrences of one exercise keep the workout's set order -----------
await seedWorkout(alice, "Order day", day(5), [
  {
    templateId: order,
    position: 0,
    sets: [
      { weightKg: "60", reps: 10 },
      { weightKg: "80", reps: 5 },
    ],
  },
  // The same template appears again later in the workout; its sets follow the
  // first occurrence's, not an arbitrary join order.
  { templateId: order, position: 1, sets: [{ weightKg: "70", reps: 8 }] },
  // A different exercise's set must never leak into this exercise's rows.
  { templateId: other, position: 2, sets: [{ weightKg: "500", reps: 1 }] },
  { templateId: order, position: 3, sets: [{ weightKg: "999", reps: 1, completedAt: null }] },
]);
// A workout where every set of this exercise is unfinished is not a session.
await seedWorkout(alice, "Only incomplete", day(6), [
  { templateId: order, position: 0, sets: [{ weightKg: "999", reps: 1, completedAt: null }] },
]);

const orderHistory = await getExerciseHistory(db, alice, order);
check(
  "a workout with only an unfinished set is not a session",
  orderHistory.sessions.map((s) => s.title).join(",") === "Order day",
  orderHistory.sessions.map((s) => s.title).join(","),
);
check(
  "sets follow the workout's exercise and set positions",
  orderHistory.sessions[0]?.sets.map((set) => formatSetValues(set, "weight_reps")).join(" | ") ===
    "60 kg × 10 reps | 80 kg × 5 reps | 70 kg × 8 reps",
  orderHistory.sessions[0]?.sets.map((set) => formatSetValues(set, "weight_reps")).join(" | "),
);

// ---- every exercise type is formatted by the shared formatter ---------------
const formatCases: Array<{ type: ExerciseType; set: SeedSet; expected: string }> = [
  { type: "weight_reps", set: { weightKg: "82.5", reps: 8, rpe: "8" }, expected: "82.5 kg × 8 reps · RPE 8" },
  { type: "bodyweight_reps", set: { reps: 12 }, expected: "12 reps" },
  { type: "bodyweight_weighted", set: { weightKg: "10", reps: 8 }, expected: "10 kg × 8 reps" },
  { type: "bodyweight_assisted", set: { weightKg: "20", reps: 5 }, expected: "20 kg × 5 reps" },
  { type: "reps_only", set: { reps: 15 }, expected: "15 reps" },
  { type: "duration", set: { durationSeconds: 90 }, expected: "90s" },
  { type: "weight_duration", set: { weightKg: "40", durationSeconds: 60 }, expected: "40 kg × 60s" },
  { type: "distance_duration", set: { distanceMeters: 5000, durationSeconds: 1500 }, expected: "5000 m × 1500s" },
  { type: "short_distance_weight", set: { distanceMeters: 50, weightKg: "20" }, expected: "50 m × 20 kg" },
  { type: "floors_duration", set: { floors: 10, durationSeconds: 300 }, expected: "10 floors × 300s" },
  { type: "steps_duration", set: { steps: 1000, durationSeconds: 1200 }, expected: "1000 steps × 1200s" },
];
check("every exercise type is covered", formatCases.length === EXERCISE_TYPES.length);

for (const [index, testCase] of formatCases.entries()) {
  const templateId = await mkExercise(alice, `Format ${testCase.type}`, testCase.type);
  await seedWorkout(alice, `Format ${testCase.type}`, day(20 + index), [
    { templateId, position: 0, sets: [testCase.set] },
  ]);
  const history = await getExerciseHistory(db, alice, templateId);
  const set = history.sessions[0]?.sets[0];
  const formatted = set === undefined ? "<no set>" : formatSetValues(set, testCase.type);
  check(
    `formats a ${testCase.type} set`,
    history.exerciseType === testCase.type && formatted === testCase.expected,
    formatted,
  );
}

// ---- a record indicator belongs only to the exercise that earned it ---------
const alphaBetaOld = await seedWorkout(alice, "Alpha Beta old", day(7), [
  { templateId: alpha, position: 0, sets: [{ weightKg: "100", reps: 5 }] },
  { templateId: beta, position: 1, sets: [{ weightKg: "50", reps: 5 }] },
]);
const alphaBetaNew = await seedWorkout(alice, "Alpha Beta new", day(8), [
  { templateId: alpha, position: 0, sets: [{ weightKg: "110", reps: 5 }] },
  { templateId: beta, position: 1, sets: [{ weightKg: "50", reps: 5 }] },
]);

const alphaHistory = await getExerciseHistory(db, alice, alpha);
const betaHistory = await getExerciseHistory(db, alice, beta);
const alphaNew = alphaHistory.sessions.find((s) => s.workoutId === alphaBetaNew);
const betaNew = betaHistory.sessions.find((s) => s.workoutId === alphaBetaNew);
check(
  "a first-ever workout shows no indicator",
  categoriesOf(alphaHistory.sessions.find((s) => s.workoutId === alphaBetaOld)) === "",
);
check(
  "a workout that strictly improves shows one indicator per category",
  categoriesOf(alphaNew) === "heaviest_weight,best_e1rm,best_set_volume",
  categoriesOf(alphaNew),
);
check(
  "the same workout shows no indicator for the exercise that only tied",
  betaNew !== undefined && betaNew.records.length === 0,
  categoriesOf(betaNew),
);

// ---- an all-tie workout shows nothing ---------------------------------------
check(
  "an all-tie workout shows no indicator",
  categoriesOf(benchHistory.sessions[0]) === "" &&
    categoriesOf(benchHistory.sessions[1]) === "heaviest_weight,best_e1rm,best_set_volume",
  `${categoriesOf(benchHistory.sessions[1])} / ${categoriesOf(benchHistory.sessions[0])}`,
);

// ---- deleting a historical workout recalculates both history and indicators -
const delOld = await seedWorkout(alice, "Del old", day(10), [
  { templateId: del, position: 0, sets: [{ weightKg: "120", reps: 5 }] },
]);
await seedWorkout(alice, "Del mid", day(11), [
  { templateId: del, position: 0, sets: [{ weightKg: "110", reps: 5 }] },
]);
await seedWorkout(alice, "Del new", day(12), [
  { templateId: del, position: 0, sets: [{ weightKg: "115", reps: 5 }] },
]);

const beforeDelete = await getExerciseHistory(db, alice, del);
check(
  "before the delete the old best suppresses every later workout",
  beforeDelete.sessions.map((s) => s.title).join(",") === "Del new,Del mid,Del old" &&
    categoriesOf(beforeDelete.sessions[0]) === "" &&
    categoriesOf(beforeDelete.sessions[1]) === "",
  beforeDelete.sessions.map((s) => `${s.title}:${categoriesOf(s)}`).join(" | "),
);

await query(`delete from workout where id = $1`, [delOld]);

const afterDelete = await getExerciseHistory(db, alice, del);
check(
  "the deleted workout is gone from the derived history",
  afterDelete.sessions.map((s) => s.title).join(",") === "Del new,Del mid",
  afterDelete.sessions.map((s) => s.title).join(","),
);
check(
  "the remaining first-ever workout still earns nothing",
  categoriesOf(afterDelete.sessions[1]) === "",
  categoriesOf(afterDelete.sessions[1]),
);
check(
  "the newest workout now earns against what remains",
  categoriesOf(afterDelete.sessions[0]) === "heaviest_weight,best_e1rm,best_set_volume",
  categoriesOf(afterDelete.sessions[0]),
);
check(
  "the surviving set values are unchanged",
  afterDelete.sessions[0] !== undefined &&
    formatSetValues(afterDelete.sessions[0].sets[0], "weight_reps") === "115 kg × 5 reps",
);

// ---- empty states and isolation --------------------------------------------
const empty = await mkExercise(alice, "Never performed", "weight_reps");
const emptyHistory = await getExerciseHistory(db, alice, empty);
check(
  "an exercise with no completed occurrence has no sessions and no type",
  emptyHistory.exerciseType === null && emptyHistory.sessions.length === 0,
);
check(
  "another user has no history for the exercise",
  (await getExerciseHistory(db, bob, bench)).sessions.length === 0,
);

await close();

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
