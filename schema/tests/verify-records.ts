import {
  DURATION_RECORD_DIRECTIONS,
  type DurationRecordDirection,
  type ExerciseType,
} from "../../schema/types";
import {
  bestRecordCandidates,
  compareRecordCandidates,
  countEarnedRecords,
  E1RM_MAX_REPS,
  estimatedOneRepMaxForRecord,
  extractSetRecordCandidates,
  RECORD_CATEGORIES,
  RECORD_CATEGORY_LABELS,
  type RecordCandidate,
  type RecordCategory,
  type RecordDirection,
  type RecordSetValues,
} from "../../lib/records";

/**
 * The record algebra.
 *
 * These functions are pure, so this suite needs no database: it pins the
 * per-type category table, the strict-improvement rule, the first-ever
 * distinction, and the one-record-per-category-per-workout collapse.
 */
let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

const near = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a === b : Math.abs(a - b) < 1e-9;

/** A completed set with everything unset, so each case states only what it measures. */
function values(overrides: Partial<RecordSetValues> = {}): RecordSetValues {
  return {
    completed_at: new Date("2024-01-01T00:00:00Z"),
    reps: null,
    weight_kg: null,
    duration_seconds: null,
    distance_meters: null,
    metrics: {},
    ...overrides,
  };
}

/** A stable key for a category list, so table checks are order-independent. */
function categoryKey(categories: readonly RecordCategory[]): string {
  return [...categories].sort().join(",");
}

function valuesByCategory(
  candidates: readonly RecordCandidate[],
): Partial<Record<RecordCategory, number>> {
  const values: Partial<Record<RecordCategory, number>> = {};
  for (const candidate of candidates) values[candidate.category] = candidate.value;
  return values;
}

const only = (candidates: readonly RecordCandidate[], category: RecordCategory) =>
  candidates.filter((candidate) => candidate.category === category);

const weightReps = (weight: string, reps = 5) =>
  extractSetRecordCandidates(values({ reps, weight_kg: weight }), "weight_reps");

// ---------------------------------------------------------------------------
// The category table, one representative completed set per exercise type
// ---------------------------------------------------------------------------

interface TypeCase {
  exerciseType: ExerciseType;
  set: Partial<RecordSetValues>;
  expected: Partial<Record<RecordCategory, number>>;
}

const TYPE_CASES: readonly TypeCase[] = [
  {
    exerciseType: "weight_reps",
    set: { reps: 5, weight_kg: "100" },
    // 100 × (1 + 5/30) = 116.666…, volume is weight × reps for the set.
    expected: { heaviest_weight: 100, best_e1rm: 116.66666666666667, most_reps: 5, best_set_volume: 500 },
  },
  { exerciseType: "bodyweight_reps", set: { reps: 12 }, expected: { most_reps: 12 } },
  {
    exerciseType: "bodyweight_weighted",
    set: { reps: 8, weight_kg: "20" },
    expected: { heaviest_added_weight: 20, most_reps: 8 },
  },
  // No reps category for assisted sets this milestone.
  { exerciseType: "bodyweight_assisted", set: { reps: 8, weight_kg: "15" }, expected: { lowest_assistance: 15 } },
  { exerciseType: "reps_only", set: { reps: 30 }, expected: { most_reps: 30 } },
  { exerciseType: "duration", set: { duration_seconds: 60 }, expected: { best_duration: 60 } },
  {
    exerciseType: "weight_duration",
    set: { weight_kg: "40", duration_seconds: 90 },
    expected: { heaviest_weight: 40, longest_duration: 90 },
  },
  {
    exerciseType: "distance_duration",
    set: { distance_meters: 5000, duration_seconds: 1500 },
    // Pace is metres per second: 5000 / 1500 = 3.333…
    expected: { longest_distance: 5000, best_pace: 3.3333333333333335 },
  },
  {
    exerciseType: "short_distance_weight",
    set: { distance_meters: 20, weight_kg: "50" },
    expected: { heaviest_weight: 50, longest_distance: 20 },
  },
  {
    exerciseType: "floors_duration",
    set: { metrics: { floors: 20 }, duration_seconds: 60 },
    // 20 floors in 60 s = 20 per minute.
    expected: { most_floors: 20, best_floors_per_minute: 20 },
  },
  {
    exerciseType: "steps_duration",
    set: { metrics: { steps: 300 }, duration_seconds: 120 },
    // 300 steps in 120 s = 150 per minute.
    expected: { most_steps: 300, best_steps_per_minute: 150 },
  },
];

const covered = new Set<RecordCategory>();
for (const testCase of TYPE_CASES) {
  const candidates = extractSetRecordCandidates(values(testCase.set), testCase.exerciseType);
  const got = valuesByCategory(candidates);
  const expectedKeys = Object.keys(testCase.expected) as RecordCategory[];
  check(
    `${testCase.exerciseType} earns exactly ${categoryKey(expectedKeys)}`,
    categoryKey(candidates.map((c) => c.category)) === categoryKey(expectedKeys),
    JSON.stringify(got),
  );
  check(
    `${testCase.exerciseType} values are canonical`,
    expectedKeys.every((category) => near(got[category], testCase.expected[category])),
    JSON.stringify(testCase.expected),
  );
  for (const candidate of candidates) covered.add(candidate.category);
}

check(
  "the per-type table covers every category in the union",
  categoryKey([...covered]) === categoryKey(RECORD_CATEGORIES),
  [...covered].join(","),
);

check(
  "every category has display wording",
  RECORD_CATEGORIES.every((category) => (RECORD_CATEGORY_LABELS[category] ?? "").length > 0),
);

// Direction is fixed per category, except for duration's per-exercise setting.
check("weight is higher-is-better", weightReps("100")[0].direction === "higher");
check(
  "assistance is lower-is-better",
  extractSetRecordCandidates(values({ reps: 8, weight_kg: "15" }), "bodyweight_assisted")[0].direction ===
    "lower",
);
for (const direction of DURATION_RECORD_DIRECTIONS) {
  const candidates = extractSetRecordCandidates(values({ duration_seconds: 60 }), "duration", direction);
  if (direction === "none") {
    check("duration_record_direction none earns no duration record", candidates.length === 0);
    continue;
  }
  const expectedDirection: RecordDirection = direction === "lower" ? "lower" : "higher";
  check(
    `duration_record_direction ${direction} scores ${expectedDirection}`,
    candidates.length === 1 && candidates[0].direction === expectedDirection,
    JSON.stringify(candidates),
  );
}

// ---------------------------------------------------------------------------
// e1RM
// ---------------------------------------------------------------------------

check("a one-rep set's e1RM is its weight", estimatedOneRepMaxForRecord(100, 1) === 100);
check(
  "a one-rep set's e1RM candidate is its weight",
  valuesByCategory(extractSetRecordCandidates(values({ reps: 1, weight_kg: "100" }), "weight_reps"))
    .best_e1rm === 100,
);
check(`e1RM is computed at the ${E1RM_MAX_REPS}-rep cap`, near(estimatedOneRepMaxForRecord(100, 12), 140));
check("e1RM is not computed above the rep cap", estimatedOneRepMaxForRecord(100, E1RM_MAX_REPS + 1) === null);
check("e1RM ignores a zero or missing load", estimatedOneRepMaxForRecord(0, 5) === null && estimatedOneRepMaxForRecord(100, 0) === null);
const highReps = extractSetRecordCandidates(values({ reps: 20, weight_kg: "100" }), "weight_reps");
check("a 20-rep set earns no e1RM record", valuesByCategory(highReps).best_e1rm === undefined);
check(
  "no e1RM candidate is ever extracted for an assisted set",
  extractSetRecordCandidates(values({ reps: 5, weight_kg: "10" }), "bodyweight_assisted").every(
    (candidate) => candidate.category !== "best_e1rm",
  ),
);

// ---------------------------------------------------------------------------
// Values that must not qualify
// ---------------------------------------------------------------------------

check(
  "a zero load earns no weight, e1RM or volume candidate",
  categoryKey(
    extractSetRecordCandidates(values({ reps: 5, weight_kg: "0" }), "weight_reps").map((c) => c.category),
  ) === categoryKey(["most_reps"]),
);
check(
  "a missing reps value leaves only the weight",
  categoryKey(
    extractSetRecordCandidates(values({ weight_kg: "100" }), "weight_reps").map((c) => c.category),
  ) === categoryKey(["heaviest_weight"]),
);
check(
  "a zero duration earns nothing",
  extractSetRecordCandidates(values({ duration_seconds: 0 }), "duration").length === 0,
);
check(
  "a zero floor count earns nothing",
  extractSetRecordCandidates(values({ metrics: { floors: 0 }, duration_seconds: 60 }), "floors_duration")
    .length === 0,
);
check(
  "a rate with no duration is not a candidate, and never divides by zero",
  categoryKey(
    extractSetRecordCandidates(values({ metrics: { floors: 10 } }), "floors_duration").map((c) => c.category),
  ) === categoryKey(["most_floors"]),
);

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

check(
  "an incomplete weight_reps set earns nothing",
  extractSetRecordCandidates(values({ reps: 5, weight_kg: "100", completed_at: null }), "weight_reps")
    .length === 0,
);
check(
  "an incomplete set of every exercise type earns nothing",
  TYPE_CASES.every(
    (testCase) =>
      extractSetRecordCandidates(
        values({ ...testCase.set, completed_at: null }),
        testCase.exerciseType,
      ).length === 0,
  ),
);

// ---------------------------------------------------------------------------
// Strict improvement: a tie is not a record
// ---------------------------------------------------------------------------

const heavyBaseline = { heaviest_weight: 100 } as const;
const heavyOutcomes = (weight: string) =>
  compareRecordCandidates(only(weightReps(weight), "heaviest_weight"), heavyBaseline);

const improved = heavyOutcomes("105");
check(
  "a strict improvement earns exactly one record",
  improved.length === 1 &&
    improved[0].value === 105 &&
    improved[0].previousValue === 100 &&
    !improved[0].firstEver,
  JSON.stringify(improved),
);
check("an equal value is a tie and earns nothing", heavyOutcomes("100").length === 0);
check("a lower value earns nothing", heavyOutcomes("95").length === 0);
check(
  "a display-equivalent numeric is the same performance, not an improvement",
  heavyOutcomes("100.00").length === 0,
);

// ---------------------------------------------------------------------------
// First-ever results establish a baseline but do not score
// ---------------------------------------------------------------------------

const firstEver = compareRecordCandidates(weightReps("105"), {});
check(
  "a first-ever workout returns flagged, unflagged values are absent",
  firstEver.length > 0 && firstEver.every((record) => record.firstEver && record.previousValue === null),
  JSON.stringify(firstEver),
);
check("a first-ever workout counts zero records", countEarnedRecords(firstEver) === 0);
check(
  "countEarnedRecords counts only improvements",
  countEarnedRecords([...firstEver, ...improved]) === 1,
);

// ---------------------------------------------------------------------------
// One workout earns at most one record per category
// ---------------------------------------------------------------------------

const threeSets = [
  ...weightReps("80", 8),
  ...weightReps("90", 5),
  ...weightReps("100", 3),
];
const workoutBaseline = {
  heaviest_weight: 75,
  best_set_volume: 250,
  best_e1rm: 90,
  most_reps: 10,
} as const;
const workoutOutcomes = compareRecordCandidates(threeSets, workoutBaseline);
check(
  "several sets beating the baseline still yield one outcome per category",
  workoutOutcomes.length === 3 && workoutOutcomes.every((record) => !record.firstEver),
  JSON.stringify(workoutOutcomes),
);
check(
  "the outcome is the workout's best, and the baseline does not advance set by set",
  near(valuesByCategory(workoutOutcomes).heaviest_weight, 100) &&
    near(valuesByCategory(workoutOutcomes).best_set_volume, 640) &&
    near(valuesByCategory(workoutOutcomes).best_e1rm, 110) &&
    workoutOutcomes.filter((record) => record.category === "heaviest_weight").length === 1,
  JSON.stringify(valuesByCategory(workoutOutcomes)),
);
check("the workout's record count is 3", countEarnedRecords(workoutOutcomes) === 3);

const collapsed = bestRecordCandidates([
  { category: "most_reps", value: 8, direction: "higher" },
  { category: "heaviest_weight", value: 100, direction: "higher" },
  { category: "most_reps", value: 6, direction: "higher" },
]);
check(
  "bestRecordCandidates keeps one best per category in canonical order",
  collapsed.length === 2 &&
    collapsed[0].category === "heaviest_weight" &&
    collapsed[1].category === "most_reps" &&
    collapsed[1].value === 8,
  JSON.stringify(collapsed),
);

// ---------------------------------------------------------------------------
// Multiple categories and multiple exercises accumulate
// ---------------------------------------------------------------------------

const oneExercise = compareRecordCandidates(weightReps("100", 8), {
  heaviest_weight: 90,
  most_reps: 6,
  best_e1rm: 100,
  best_set_volume: 400,
});
check(
  "one exercise can earn several categories at once",
  countEarnedRecords(oneExercise) === 4,
  JSON.stringify(oneExercise),
);

const exerciseA = compareRecordCandidates(only(weightReps("60"), "heaviest_weight"), {
  heaviest_weight: 50,
});
const exerciseB = compareRecordCandidates(
  extractSetRecordCandidates(values({ reps: 25 }), "reps_only"),
  { most_reps: 20 },
);
const exerciseC = compareRecordCandidates(
  extractSetRecordCandidates(values({ reps: 10 }), "bodyweight_reps"),
  {},
);
check(
  "distinct (exercise, category) pairs accumulate across exercises",
  countEarnedRecords([...exerciseA, ...exerciseB]) === 2,
);
check(
  "first-ever exercises in the same workout do not add to the count",
  countEarnedRecords([...exerciseA, ...exerciseB, ...exerciseC]) === 2,
);

// ---------------------------------------------------------------------------
// Lower-is-better, and duration direction
// ---------------------------------------------------------------------------

const assistance = (weight: string) =>
  extractSetRecordCandidates(values({ reps: 8, weight_kg: weight }), "bodyweight_assisted");
const assistanceOutcomes = (weight: string, baseline: { lowest_assistance: number }) =>
  compareRecordCandidates(assistance(weight), baseline);

const lessAssistance = assistanceOutcomes("15", { lowest_assistance: 20 });
check(
  "less assistance improves, and reports the direction",
  lessAssistance.length === 1 &&
    lessAssistance[0].value === 15 &&
    lessAssistance[0].previousValue === 20 &&
    lessAssistance[0].direction === "lower",
  JSON.stringify(lessAssistance),
);
check("an equal assistance is a tie", assistanceOutcomes("20", { lowest_assistance: 20 }).length === 0);
check("more assistance earns nothing", assistanceOutcomes("25", { lowest_assistance: 20 }).length === 0);
check(
  "zero assistance beats a positive baseline",
  assistanceOutcomes("0", { lowest_assistance: 20 })[0]?.value === 0,
);
check("a first-ever assistance counts zero", countEarnedRecords(compareRecordCandidates(assistance("15"), {})) === 0);

const timed = (seconds: number, direction: DurationRecordDirection) =>
  extractSetRecordCandidates(values({ duration_seconds: seconds }), "duration", direction);

check(
  "with the default direction a longer hold improves",
  compareRecordCandidates(timed(60, "higher"), { best_duration: 45 })[0]?.value === 60,
);
check(
  "a shorter hold does not improve when longer is better",
  compareRecordCandidates(timed(45, "higher"), { best_duration: 60 }).length === 0,
);
check(
  "a shorter time improves when shorter is better",
  (() => {
    const record = compareRecordCandidates(timed(45, "lower"), { best_duration: 60 })[0];
    return record?.value === 45 && record.previousValue === 60 && record.direction === "lower";
  })(),
);
check(
  "a longer time does not improve when shorter is better",
  compareRecordCandidates(timed(60, "lower"), { best_duration: 60 }).length === 0,
);

// ---------------------------------------------------------------------------
// Independent pairs, with no composite metric
// ---------------------------------------------------------------------------

const weightDurationHeavier = compareRecordCandidates(
  extractSetRecordCandidates(values({ weight_kg: "60", duration_seconds: 60 }), "weight_duration"),
  { heaviest_weight: 50, longest_duration: 120 },
);
const weightDurationLonger = compareRecordCandidates(
  extractSetRecordCandidates(values({ weight_kg: "40", duration_seconds: 200 }), "weight_duration"),
  { heaviest_weight: 50, longest_duration: 120 },
);
check(
  "weight_duration scores weight and duration independently",
  weightDurationHeavier.length === 1 &&
    weightDurationHeavier[0].category === "heaviest_weight" &&
    weightDurationLonger.length === 1 &&
    weightDurationLonger[0].category === "longest_duration",
  JSON.stringify([weightDurationHeavier, weightDurationLonger]),
);

const shortHeavier = compareRecordCandidates(
  extractSetRecordCandidates(values({ weight_kg: "50", distance_meters: 8 }), "short_distance_weight"),
  { heaviest_weight: 40, longest_distance: 10 },
);
const shortFurther = compareRecordCandidates(
  extractSetRecordCandidates(values({ weight_kg: "35", distance_meters: 15 }), "short_distance_weight"),
  { heaviest_weight: 40, longest_distance: 10 },
);
check(
  "short_distance_weight scores weight and distance independently",
  shortHeavier.length === 1 &&
    shortHeavier[0].category === "heaviest_weight" &&
    shortFurther.length === 1 &&
    shortFurther[0].category === "longest_distance",
  JSON.stringify([shortHeavier, shortFurther]),
);

// ---------------------------------------------------------------------------
// Distance, pace and per-minute rates
// ---------------------------------------------------------------------------

const pace = (distanceMeters: number, durationSeconds: number) =>
  extractSetRecordCandidates(values({ distance_meters: distanceMeters, duration_seconds: durationSeconds }), "distance_duration");

check(
  "pace compares distance over duration, so a longer faster run improves",
  compareRecordCandidates(only(pace(1000, 150), "best_pace"), { best_pace: 5 })[0]?.value ===
    1000 / 150,
);
check(
  "a different distance at the same pace is a tie",
  compareRecordCandidates(only(pace(2000, 400), "best_pace"), { best_pace: 5 }).length === 0,
);
check(
  "a longer distance at a worse pace improves only distance",
  (() => {
    const records = compareRecordCandidates(pace(1000, 500), { longest_distance: 500, best_pace: 5 });
    return records.length === 1 && records[0].category === "longest_distance";
  })(),
);

const floors = (count: number, seconds: number) =>
  extractSetRecordCandidates(values({ metrics: { floors: count }, duration_seconds: seconds }), "floors_duration");
check(
  "floors per minute is a rate over the set's own duration",
  near(compareRecordCandidates(only(floors(30, 90), "best_floors_per_minute"), { best_floors_per_minute: 15 })[0]?.value, 20),
);
check(
  "an equal rate is a tie",
  compareRecordCandidates(only(floors(30, 90), "best_floors_per_minute"), { best_floors_per_minute: 20 }).length === 0,
);

const steps = (count: number, seconds: number) =>
  extractSetRecordCandidates(values({ metrics: { steps: count }, duration_seconds: seconds }), "steps_duration");
check(
  "steps per minute is a rate over the set's own duration",
  near(compareRecordCandidates(only(steps(300, 120), "best_steps_per_minute"), { best_steps_per_minute: 100 })[0]?.value, 150),
);

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
