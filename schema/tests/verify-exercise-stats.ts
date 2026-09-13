import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./harness";
import {
  directionFor,
  extractSetRecordCandidates,
  bestRecordCandidates,
  compareRecordCandidates,
  recordCategoriesForExerciseType,
  type RecordBaseline,
  type RecordCategory,
  type RecordSetValues,
} from "../../lib/records";
import {
  getExerciseStatistics,
  type ExercisePersonalRecord,
} from "../../lib/exercise-statistics";
import { RANGE_LABELS } from "../../lib/progress";
import type { DurationRecordDirection, ExerciseType } from "../../schema/types";
import { EXERCISE_TYPES } from "../../schema/types";

/**
 * The exercise page's Statistics tab.
 *
 * Every fixture is inserted with raw SQL so completion flags and timestamps are
 * exact — the states worth testing here (an incomplete set still carrying the
 * routine's prescription, an unfinished workout, an old workout outside the
 * range) are not states the normal write path can produce. The oracle for the
 * PR section is the pure Records engine folded over the same raw rows, so a
 * value, a date or a category that drifts from `getWorkoutRecords` fails.
 */
const { db, query, close, dialect } = await createTestDatabase();

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

check(`schema migrations apply (${dialect})`, true);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mkUser = async (email: string) =>
  (await query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;

const alice = await mkUser("alice@example.com");
const bob = await mkUser("bob@example.com");

interface ExerciseRef {
  id: string;
  exercise_type: ExerciseType;
  duration_record_direction: DurationRecordDirection;
}

/** A custom exercise, so every fixture is independent of the seeded catalog. */
async function mkExercise(
  ownerId: string,
  title: string,
  exerciseType: ExerciseType,
  direction?: DurationRecordDirection,
): Promise<ExerciseRef> {
  const columns = direction ? ", duration_record_direction" : "";
  const values = direction ? ", $5::duration_record_direction" : "";
  const row = (
    await query<ExerciseRef>(
      `insert into exercise_template
         (slug, title, exercise_type, primary_muscle, equipment, is_custom, owner_id${columns})
       values ($1, $2, $3, 'cardio', 'none', true, $4${values})
       returning id, exercise_type, duration_record_direction`,
      direction
        ? [`test-${randomUUID()}`, title, exerciseType, ownerId, direction]
        : [`test-${randomUUID()}`, title, exerciseType, ownerId],
    )
  ).rows[0];
  return row;
}

interface SeedSet {
  weightKg?: string;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  floors?: number;
  steps?: number;
  /** Defaults to `startedAt`; null leaves the set incomplete. */
  completedAt?: Date | null;
}

/** Inserts a workout with its exercises and sets directly, timestamps exact. */
async function seedWorkout(
  ownerId: string,
  title: string,
  startedAt: Date,
  exercises: { templateId: string; sets: SeedSet[] }[],
  endedAt: Date | null = startedAt,
): Promise<string> {
  const workoutId = (
    await query<{ id: string }>(
      `insert into workout (owner_id, title, started_at, ended_at) values ($1, $2, $3, $4) returning id`,
      [ownerId, title, startedAt, endedAt],
    )
  ).rows[0].id;

  for (const [position, exercise] of exercises.entries()) {
    const workoutExerciseId = (
      await query<{ id: string }>(
        `insert into workout_exercise (workout_id, template_id, position) values ($1, $2, $3) returning id`,
        [workoutId, exercise.templateId, position],
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

const day = (n: number) => new Date(`2026-03-${String(n).padStart(2, "0")}T10:00:00Z`);

const statsFor = (exercise: ExerciseRef, range: "all" | "30d" | "90d" | "1y" = "all", userId = alice) =>
  getExerciseStatistics(db, userId, exercise, range, "UTC");

const near = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a === b : Math.abs(a - b) < 1e-9;

// ---------------------------------------------------------------------------
// Oracle: the pure Records engine, folded over the same raw rows
// ---------------------------------------------------------------------------

interface RawRow {
  workout_id: string;
  workout_title: string;
  started_at: Date;
  completed_at: Date | null;
  reps: number | null;
  weight_kg: string | number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  metrics: Record<string, unknown>;
}

/**
 * The engine's own answer for one exercise: per-workout candidates collapsed,
 * then compared against a running baseline with `compareRecordCandidates`, so
 * first-ever establishes and a strict improvement advances. Independent of the
 * statistics module's SQL and of its fold.
 */
async function enginePersonalRecords(
  userId: string,
  exercise: ExerciseRef,
): Promise<Map<RecordCategory, { value: number; workoutId: string }>> {
  const rows = (
    await query<RawRow>(
      `select w.id as workout_id, w.title as workout_title, w.started_at,
              ws.completed_at, ws.reps, ws.weight_kg, ws.duration_seconds, ws.distance_meters, ws.metrics
         from workout_set ws
         join workout_exercise we on we.id = ws.workout_exercise_id
         join workout w on w.id = we.workout_id
        where w.owner_id = $1 and we.template_id = $2
          and w.ended_at is not null and ws.completed_at is not null
        order by w.started_at asc, w.id asc, ws.position asc`,
      [userId, exercise.id],
    )
  ).rows;

  const workouts = new Map<string, { id: string; sets: RecordSetValues[] }>();
  for (const row of rows) {
    let workout = workouts.get(row.workout_id);
    if (!workout) {
      workout = { id: row.workout_id, sets: [] };
      workouts.set(row.workout_id, workout);
    }
    workout.sets.push({
      completed_at: row.completed_at,
      reps: row.reps,
      weight_kg: row.weight_kg == null ? null : String(row.weight_kg),
      duration_seconds: row.duration_seconds,
      distance_meters: row.distance_meters,
      metrics: row.metrics,
    });
  }

  const baseline: RecordBaseline = {};
  const records = new Map<RecordCategory, { value: number; workoutId: string }>();
  for (const workout of workouts.values()) {
    const candidates = workout.sets.flatMap((set) =>
      extractSetRecordCandidates(set, exercise.exercise_type, exercise.duration_record_direction),
    );
    for (const outcome of compareRecordCandidates(candidates, baseline)) {
      baseline[outcome.category] = outcome.value;
      records.set(outcome.category, { value: outcome.value, workoutId: workout.id });
    }
  }
  return records;
}

const asMap = (records: readonly ExercisePersonalRecord[]) =>
  new Map(records.map((record) => [record.category, record]));

// ---------------------------------------------------------------------------
// 1. Metrics per set type — one representative completed set per type
// ---------------------------------------------------------------------------

interface TypeCase {
  exerciseType: ExerciseType;
  direction?: DurationRecordDirection;
  set: SeedSet;
  expected: Partial<Record<RecordCategory, number>>;
}

const TYPE_CASES: readonly TypeCase[] = [
  {
    exerciseType: "weight_reps",
    set: { reps: 5, weightKg: "100" },
    // 100 × (1 + 5/30), volume weight × reps for the set, most reps 5.
    expected: {
      heaviest_weight: 100,
      best_e1rm: 116.66666666666667,
      most_reps: 5,
      best_set_volume: 500,
    },
  },
  { exerciseType: "bodyweight_reps", set: { reps: 12 }, expected: { most_reps: 12 } },
  {
    exerciseType: "bodyweight_weighted",
    set: { reps: 8, weightKg: "20" },
    expected: { heaviest_added_weight: 20, most_reps: 8 },
  },
  {
    exerciseType: "bodyweight_assisted",
    set: { reps: 8, weightKg: "15" },
    expected: { lowest_assistance: 15 },
  },
  { exerciseType: "reps_only", set: { reps: 30 }, expected: { most_reps: 30 } },
  { exerciseType: "duration", set: { durationSeconds: 60 }, expected: { best_duration: 60 } },
  {
    exerciseType: "weight_duration",
    set: { weightKg: "40", durationSeconds: 90 },
    expected: { heaviest_weight: 40, longest_duration: 90 },
  },
  {
    exerciseType: "distance_duration",
    set: { distanceMeters: 5000, durationSeconds: 1500 },
    // Canonical units: metres and metres/second.
    expected: { longest_distance: 5000, best_pace: 5000 / 1500 },
  },
  {
    exerciseType: "short_distance_weight",
    set: { distanceMeters: 20, weightKg: "50" },
    expected: { heaviest_weight: 50, longest_distance: 20 },
  },
  {
    exerciseType: "floors_duration",
    set: { floors: 20, durationSeconds: 60 },
    expected: { most_floors: 20, best_floors_per_minute: 20 },
  },
  {
    exerciseType: "steps_duration",
    set: { steps: 300, durationSeconds: 120 },
    expected: { most_steps: 300, best_steps_per_minute: 150 },
  },
];

for (const [index, testCase] of TYPE_CASES.entries()) {
  const exercise = await mkExercise(alice, `Type ${testCase.exerciseType}`, testCase.exerciseType, testCase.direction);
  await seedWorkout(alice, `Type ${index}`, day(1), [
    { templateId: exercise.id, sets: [testCase.set] },
  ]);
  const stats = await statsFor(exercise);

  const labels = Object.keys(testCase.expected) as RecordCategory[];
  check(
    `${testCase.exerciseType}: only its own categories are reported`,
    Object.keys(stats.totals.bests).sort().join(",") === [...labels].sort().join(","),
    JSON.stringify(stats.totals.bests),
  );
  check(
    `${testCase.exerciseType}: every value is canonical`,
    labels.every((category) => near(stats.totals.bests[category], testCase.expected[category])),
    JSON.stringify(testCase.expected),
  );
  check(
    `${testCase.exerciseType}: one session, one completed set`,
    stats.totals.sessions === 1 && stats.totals.completedSets === 1 && stats.sessions.length === 1,
    `${stats.totals.sessions}/${stats.totals.completedSets}`,
  );
  check(
    `${testCase.exerciseType}: PR categories match the engine's table`,
    stats.personalRecords.map((record) => record.category).sort().join(",") ===
      [...recordCategoriesForExerciseType(testCase.exerciseType, testCase.direction ?? "higher")].sort().join(","),
    stats.personalRecords.map((record) => record.category).join(","),
  );

  // The same one-workout history, answered by the pure engine.
  const oracle = await enginePersonalRecords(alice, exercise);
  const records = asMap(stats.personalRecords);
  check(
    `${testCase.exerciseType}: PR values agree with the Records engine`,
    oracle.size === records.size &&
      [...oracle.entries()].every(
        ([category, expected]) =>
          near(records.get(category)?.value, expected.value) &&
          records.get(category)?.workoutId === expected.workoutId,
      ),
    JSON.stringify([...records.entries()]),
  );

  // And the per-category best is exactly the candidate the engine extracts.
  const engineBest = bestRecordCandidates(
    extractSetRecordCandidates(
      {
        completed_at: day(1),
        reps: testCase.set.reps ?? null,
        weight_kg: testCase.set.weightKg ?? null,
        duration_seconds: testCase.set.durationSeconds ?? null,
        distance_meters: testCase.set.distanceMeters ?? null,
        metrics: {
          ...(testCase.set.floors === undefined ? {} : { floors: testCase.set.floors }),
          ...(testCase.set.steps === undefined ? {} : { steps: testCase.set.steps }),
        },
      },
      testCase.exerciseType,
      testCase.direction ?? "higher",
    ),
  );
  check(
    `${testCase.exerciseType}: SQL bests equal the extracted candidates`,
    engineBest.every((candidate) => near(stats.totals.bests[candidate.category], candidate.value)),
    JSON.stringify(engineBest),
  );
}

// Every exercise type is covered above. A Record rather than a Set: the table
// is static, and this only asks membership.
const coverage: Record<string, true> = {};
for (const testCase of TYPE_CASES) coverage[testCase.exerciseType] = true;
check(
  "every exercise type has a verified case",
  EXERCISE_TYPES.every((exerciseType) => coverage[exerciseType] === true),
  Object.keys(coverage).join(","),
);

// ---------------------------------------------------------------------------
// 2. Completed sets only: incomplete sets and routine prescriptions are invisible
// ---------------------------------------------------------------------------

const prescribed = await mkExercise(alice, "Prescribed", "weight_reps");
// A routine whose prescription is copied onto an uncompleted set, as starting a
// workout does. The prescription must never reach a statistic or a record.
const routineId = (
  await query<{ id: string }>(`insert into routine (owner_id, title) values ($1, 'Heavy plan') returning id`, [alice])
).rows[0].id;
const routineExerciseId = (
  await query<{ id: string }>(
    `insert into routine_exercise (routine_id, template_id, position) values ($1, $2, 0) returning id`,
    [routineId, prescribed.id],
  )
).rows[0].id;
await query(
  `insert into routine_set (routine_exercise_id, position, set_type, weight_kg, reps) values ($1, 0, 'normal', 500, 5)`,
  [routineExerciseId],
);
await seedWorkout(alice, "Prescribed started", day(1), [
  {
    templateId: prescribed.id,
    sets: [
      { weightKg: "500", reps: 5, completedAt: null },
      { weightKg: "110", reps: 5 },
    ],
  },
]);
const prescribedStats = await statsFor(prescribed);
check(
  "an incomplete set carrying the routine's prescription is excluded",
  near(prescribedStats.totals.bests.heaviest_weight, 110) && prescribedStats.totals.completedSets === 1,
  JSON.stringify(prescribedStats.totals.bests),
);
check(
  "the PR is the completed set, not the prescription",
  near(asMap(prescribedStats.personalRecords).get("heaviest_weight")?.value, 110),
  JSON.stringify(prescribedStats.personalRecords),
);

// A completed set remains provisional while its workout is active. Finishing
// the workout is the transition that makes the same set durable history.
const unfinished = await mkExercise(alice, "Unfinished", "weight_reps");
const unfinishedWorkout = await seedWorkout(
  alice,
  "Still logging",
  day(2),
  [{ templateId: unfinished.id, sets: [{ weightKg: "60", reps: 5 }, { reps: 5, completedAt: null }] }],
  null,
);
const activeStats = await statsFor(unfinished);
check(
  "a completed set in an active workout is excluded",
  activeStats.allTimeCompletedSets === 0 && activeStats.personalRecords.length === 0,
  `${activeStats.allTimeCompletedSets}`,
);
await query(`update workout set ended_at = $2 where id = $1`, [unfinishedWorkout, day(3)]);
const finishedStats = await statsFor(unfinished);
check(
  "finishing the workout publishes its completed set",
  finishedStats.allTimeCompletedSets === 1 && near(finishedStats.totals.bests.heaviest_weight, 60),
  `${finishedStats.allTimeCompletedSets}`,
);

// ---------------------------------------------------------------------------
// 3. No history: the empty-state inputs are empty, never zeroes
// ---------------------------------------------------------------------------

const never = await mkExercise(alice, "Never performed", "weight_reps");
const neverStats = await statsFor(never);
check(
  "an exercise with no sets reports no history",
  neverStats.allTimeCompletedSets === 0 &&
    neverStats.totals.completedSets === 0 &&
    neverStats.totals.sessions === 0 &&
    neverStats.sessions.length === 0,
  JSON.stringify(neverStats.totals),
);
check("an exercise with no sets has no PR cards", neverStats.personalRecords.length === 0);

const onlyIncomplete = await mkExercise(alice, "Only incomplete", "duration");
await seedWorkout(alice, "Empty", day(3), [
  { templateId: onlyIncomplete.id, sets: [{ durationSeconds: 300, completedAt: null }] },
]);
const incompleteStats = await statsFor(onlyIncomplete);
check(
  "only-incomplete history is still no history",
  incompleteStats.allTimeCompletedSets === 0 &&
    incompleteStats.personalRecords.length === 0 &&
    incompleteStats.totals.bests.best_duration === undefined,
  JSON.stringify(incompleteStats.totals),
);

// ---------------------------------------------------------------------------
// 4. The `<=12` e1RM policy, and a single is its load
// ---------------------------------------------------------------------------

const highRep = await mkExercise(alice, "High rep", "weight_reps");
await seedWorkout(alice, "High rep", day(1), [
  { templateId: highRep.id, sets: [{ weightKg: "100", reps: 20 }] },
]);
const highRepStats = await statsFor(highRep);
check(
  "no e1RM above 12 reps, but weight and reps still report",
  highRepStats.totals.bests.best_e1rm === undefined &&
    near(highRepStats.totals.bests.heaviest_weight, 100) &&
    highRepStats.totals.bests.most_reps === 20,
  JSON.stringify(highRepStats.totals.bests),
);
check(
  "the 12-rep cap matches the engine",
  highRepStats.totals.bests.best_e1rm === undefined &&
    (await enginePersonalRecords(alice, highRep)).has("best_e1rm") === false,
);

const twelve = await mkExercise(alice, "Twelve reps", "weight_reps");
await seedWorkout(alice, "Twelve reps", day(1), [
  { templateId: twelve.id, sets: [{ weightKg: "100", reps: 12 }] },
]);
const twelveStats = await statsFor(twelve);
check(
  "e1RM is computed at exactly 12 reps",
  near(twelveStats.totals.bests.best_e1rm, 140),
  `${twelveStats.totals.bests.best_e1rm}`,
);

const single = await mkExercise(alice, "Single", "weight_reps");
await seedWorkout(alice, "Single", day(1), [
  { templateId: single.id, sets: [{ weightKg: "100", reps: 1 }] },
]);
const singleStats = await statsFor(single);
check(
  "a one-rep set's e1RM is its actual load, not an inflated estimate",
  near(singleStats.totals.bests.best_e1rm, 100),
  `${singleStats.totals.bests.best_e1rm}`,
);

// ---------------------------------------------------------------------------
// 5. PR dates: a tie never re-dates a record, a later best does
// ---------------------------------------------------------------------------

const tie = await mkExercise(alice, "Ties", "weight_reps");
const tieFirst = await seedWorkout(alice, "Tie first", day(1), [
  { templateId: tie.id, sets: [{ weightKg: "100", reps: 5 }] },
]);
await seedWorkout(alice, "Tie equal", day(2), [
  { templateId: tie.id, sets: [{ weightKg: "100", reps: 5 }] },
]);
const tieStats = await statsFor(tie);
const tieRecord = asMap(tieStats.personalRecords).get("heaviest_weight");
check(
  "an equal later performance never re-dates the PR",
  near(tieRecord?.value, 100) && tieRecord?.workoutId === tieFirst,
  JSON.stringify(tieRecord),
);

const later = await mkExercise(alice, "Later best", "weight_reps");
await seedWorkout(alice, "Later A", day(4), [{ templateId: later.id, sets: [{ weightKg: "90", reps: 5 }] }]);
const laterB = await seedWorkout(alice, "Later B", day(5), [
  { templateId: later.id, sets: [{ weightKg: "105", reps: 5 }] },
]);
await seedWorkout(alice, "Later C", day(6), [{ templateId: later.id, sets: [{ weightKg: "100", reps: 5 }] }]);
const laterStats = await statsFor(later);
const laterRecord = asMap(laterStats.personalRecords).get("heaviest_weight");
check(
  "a new best moves the PR to the workout that achieved it",
  near(laterRecord?.value, 105) && laterRecord?.workoutId === laterB && laterRecord?.workoutTitle === "Later B",
  JSON.stringify(laterRecord),
);

// The whole PR list agrees with the engine, categories included.
const laterOracle = await enginePersonalRecords(alice, later);
const laterRecords = asMap(laterStats.personalRecords);
check(
  "the full PR list agrees with the engine (value, category and workout)",
  laterOracle.size === laterRecords.size &&
    [...laterOracle.entries()].every(
      ([category, expected]) =>
        near(laterRecords.get(category)?.value, expected.value) &&
        laterRecords.get(category)?.workoutId === expected.workoutId,
    ),
  JSON.stringify([...laterRecords.entries()]),
);

// ---------------------------------------------------------------------------
// 6. Assisted is lower-is-better; duration follows its direction
// ---------------------------------------------------------------------------

const assisted = await mkExercise(alice, "Assisted row", "bodyweight_assisted");
await seedWorkout(alice, "Assist A", day(1), [
  { templateId: assisted.id, sets: [{ weightKg: "40", reps: 10 }] },
]);
const assistedB = await seedWorkout(alice, "Assist B", day(2), [
  { templateId: assisted.id, sets: [{ weightKg: "30", reps: 8 }] },
]);
const assistedStats = await statsFor(assisted);
const assistedRecord = asMap(assistedStats.personalRecords).get("lowest_assistance");
check(
  "assisted reports only Lowest Assistance, and less is the PR",
  assistedStats.personalRecords.length === 1 &&
    near(assistedRecord?.value, 30) &&
    assistedRecord?.workoutId === assistedB,
  JSON.stringify(assistedStats.personalRecords),
);
check(
  "assisted has no reps category",
  assistedStats.totals.bests.most_reps === undefined &&
    recordCategoriesForExerciseType("bodyweight_assisted").join(",") === "lowest_assistance",
);

const faster = await mkExercise(alice, "Faster", "duration", "lower");
await seedWorkout(alice, "Fast A", day(1), [{ templateId: faster.id, sets: [{ durationSeconds: 90 }] }]);
const fastB = await seedWorkout(alice, "Fast B", day(2), [{ templateId: faster.id, sets: [{ durationSeconds: 60 }] }]);
const fasterStats = await statsFor(faster);
check(
  "a lower-is-better duration records the faster time",
  near(fasterStats.totals.bests.best_duration, 60) &&
    asMap(fasterStats.personalRecords).get("best_duration")?.workoutId === fastB &&
    directionFor("best_duration", "lower") === "lower",
  JSON.stringify(fasterStats.personalRecords),
);

const noDirection = await mkExercise(alice, "Untracked", "duration", "none");
await seedWorkout(alice, "None A", day(1), [{ templateId: noDirection.id, sets: [{ durationSeconds: 120 }] }]);
const noDirectionStats = await statsFor(noDirection);
check(
  "duration direction none measures the set but earns no record",
  noDirectionStats.totals.completedSets === 1 &&
    noDirectionStats.personalRecords.length === 0 &&
    Object.keys(noDirectionStats.totals.bests).length === 0,
  JSON.stringify(noDirectionStats.totals),
);

// ---------------------------------------------------------------------------
// 7. Ranges: windowed totals and series, but an all-time PR section
// ---------------------------------------------------------------------------

const ranged = await mkExercise(alice, "Ranged", "weight_reps");
const oldWorkout = await seedWorkout(alice, "Old heavy", new Date("2020-01-01T10:00:00Z"), [
  { templateId: ranged.id, sets: [{ weightKg: "200", reps: 5 }] },
]);
// Relative to the run, not a fixed date: a range is measured from "now", and a
// March fixture would fall outside a 30-day window in September.
const recentWorkout = await seedWorkout(alice, "Recent light", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), [
  { templateId: ranged.id, sets: [{ weightKg: "100", reps: 5 }] },
]);

const allRange = await statsFor(ranged, "all");
const recentRange = await statsFor(ranged, "30d");
check(
  "all time sees both sessions, the window sees one",
  allRange.totals.sessions === 2 && recentRange.totals.sessions === 1,
  `${allRange.totals.sessions}/${recentRange.totals.sessions}`,
);
check(
  "the windowed best is the window's own",
  near(recentRange.totals.bests.heaviest_weight, 100) && near(allRange.totals.bests.heaviest_weight, 200),
  `${recentRange.totals.bests.heaviest_weight}/${allRange.totals.bests.heaviest_weight}`,
);
check(
  "the series follows the range",
  allRange.sessions.length === 2 &&
    recentRange.sessions.length === 1 &&
    recentRange.sessions[0].workoutId === recentWorkout,
);
check(
  "the PR section stays all-time under a window",
  near(asMap(recentRange.personalRecords).get("heaviest_weight")?.value, 200) &&
    asMap(recentRange.personalRecords).get("heaviest_weight")?.workoutId === oldWorkout,
  JSON.stringify(recentRange.personalRecords),
);
check("every range has a label", Object.keys(RANGE_LABELS).length === 4);

// ---------------------------------------------------------------------------
// 8. Efficiency: the series is bounded by sessions, not by sets
// ---------------------------------------------------------------------------

const bulk = await mkExercise(alice, "Bulk", "weight_reps");
await seedWorkout(alice, "Bulk A", day(11), [{ templateId: bulk.id, sets: [{ weightKg: "50", reps: 5 }] }]);
const beforeBulk = await statsFor(bulk);
await seedWorkout(
  alice,
  "Bulk B",
  day(12),
  [{ templateId: bulk.id, sets: Array.from({ length: 40 }, () => ({ weightKg: "60", reps: 5 })) }],
);
const afterBulk = await statsFor(bulk);
check(
  "40 sets in one session grow completed sets by 40 and sessions by 1",
  afterBulk.totals.completedSets === beforeBulk.totals.completedSets + 40 &&
    afterBulk.totals.sessions === beforeBulk.totals.sessions + 1 &&
    afterBulk.sessions.length === beforeBulk.sessions.length + 1,
  `${beforeBulk.totals.sessions}->${afterBulk.totals.sessions}, ${beforeBulk.totals.completedSets}->${afterBulk.totals.completedSets}`,
);
check(
  "one session's aggregate is its own best, not the sum",
  afterBulk.sessions[1].bests.heaviest_weight === 60 && near(afterBulk.sessions[1].volumeKg, 60 * 5 * 40),
  JSON.stringify(afterBulk.sessions[1]),
);

// ---------------------------------------------------------------------------
// 9. Ownership and determinism
// ---------------------------------------------------------------------------

const shared = await mkExercise(alice, "Shared template", "weight_reps");
await seedWorkout(alice, "Alice real", day(13), [{ templateId: shared.id, sets: [{ weightKg: "100", reps: 5 }] }]);
await seedWorkout(bob, "Bob huge", day(14), [{ templateId: shared.id, sets: [{ weightKg: "500", reps: 5 }] }]);
const aliceShared = await statsFor(shared, "all", alice);
const bobShared = await statsFor(shared, "all", bob);
check(
  "another user's history is invisible to this user's statistics",
  near(aliceShared.totals.bests.heaviest_weight, 100) && aliceShared.totals.sessions === 1,
  JSON.stringify(aliceShared.totals.bests),
);
check(
  "each user sees their own statistics for a shared template",
  near(bobShared.totals.bests.heaviest_weight, 500) && bobShared.totals.sessions === 1,
  JSON.stringify(bobShared.totals.bests),
);

const repeat = JSON.stringify(await statsFor(shared, "all", alice));
check("re-deriving the same history is identical", repeat === JSON.stringify(aliceShared));

await close();

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
