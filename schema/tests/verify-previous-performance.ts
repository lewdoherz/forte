import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./harness";
import { getPreviousPerformances } from "../../lib/previous-performance";
import { formatSetValues } from "../../lib/workout-stats";

/**
 * Previous-performance lookup.
 *
 * The fixtures are seeded with raw SQL rather than through startWorkout/logSet
 * because the interesting cases are the ones the write path cannot produce:
 * a workout that was finished without logging sets, a set left incomplete
 * inside a logged session, and per-type values (floors/steps in `metrics`).
 * The oracle is the raw rows, so a lookup that reads a routine template, an
 * unfinished workout, or another user's history fails against them.
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
const carol = await mkUser("carol@example.com");

/** A custom exercise of a chosen type; custom so each fixture is independent. */
const mkExercise = async (ownerId: string, title: string, exerciseType: string) =>
  (
    await query<{ id: string }>(
      `insert into exercise_template (slug, title, exercise_type, primary_muscle, equipment, is_custom, owner_id)
       values ($1, $2, $3, 'cardio', 'none', true, $4) returning id`,
      [`test-${randomUUID()}`, title, exerciseType, ownerId],
    )
  ).rows[0].id;

interface SeedSet {
  weightKg?: string;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  rpe?: string;
  floors?: number;
  steps?: number;
  /** Defaults to `startedAt`; pass null to leave the set uncompleted. */
  completedAt?: Date | null;
}

interface SeedExercise {
  templateId: string;
  /** Which occurrence of the template in this workout (position within it). */
  position: number;
  sets: SeedSet[];
}

/** Inserts a workout with its exercises and sets directly, so timestamps and completion are exact. */
async function seedWorkout(
  ownerId: string,
  title: string,
  startedAt: Date,
  endedAt: Date | null,
  exercises: SeedExercise[],
): Promise<string> {
  const workoutId = (
    await query<{ id: string }>(
      `insert into workout (owner_id, title, started_at, ended_at) values ($1, $2, $3, $4) returning id`,
      [ownerId, title, startedAt, endedAt],
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
         values ($1, $2, 'normal', $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          workoutExerciseId,
          index,
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

const hourAfter = (date: Date) => new Date(date.getTime() + 3_600_000);

const sys = await db.selectFrom("exercise_template").selectAll().where("is_custom", "=", false).execute();
const bench = sys.find((e) => e.title === "Bench Press");
if (!bench) bail("bench fixture present");

// ---- empty history ---------------------------------------------------------
check(
  "a user with no history gets an empty map, not a zero entry",
  (await getPreviousPerformances(db, alice, [bench.id])).size === 0,
);
check("no requested exercises yields an empty map", (await getPreviousPerformances(db, alice, [])).size === 0);

// ---- most recent completed performance -------------------------------------
const olderStarted = new Date("2026-01-01T10:00:00Z");
await seedWorkout(alice, "Bench A", olderStarted, hourAfter(olderStarted), [
  {
    templateId: bench.id,
    position: 0,
    sets: [
      { weightKg: "100", reps: 5 },
      { weightKg: "95", reps: 8 },
    ],
  },
]);

const newerStarted = new Date("2026-01-08T10:00:00Z");
await seedWorkout(alice, "Bench B", newerStarted, hourAfter(newerStarted), [
  {
    templateId: bench.id,
    position: 0,
    sets: [
      { weightKg: "110", reps: 3 },
      { weightKg: "105", reps: 6 },
    ],
  },
]);

let benchPrevious = (await getPreviousPerformances(db, alice, [bench.id])).get(bench.id);
// `weight_kg` is numeric(7,3) and the driver returns it verbatim, so the value
// is the database's "110.000" rather than a float — the formatter trims it for
// display, but the lookup must not silently convert it.
check(
  "the most recent completed performance is used",
  benchPrevious?.sets[0].weight_kg === "110.000" &&
    benchPrevious?.sets[0].reps === 3 &&
    benchPrevious?.sets[1].weight_kg === "105.000" &&
    benchPrevious?.sets[1].reps === 6,
  JSON.stringify(benchPrevious?.sets),
);
check(
  "performedAt is the session's start",
  benchPrevious?.performedAt.getTime() === newerStarted.getTime(),
);
check(
  "an earlier workout is not used when a newer one exists",
  benchPrevious?.sets[0].weight_kg !== "100.000" && benchPrevious?.sets[0].weight_kg === "110.000",
);

// ---- an unfinished workout is never a source -------------------------------
const activeStarted = new Date("2026-01-15T10:00:00Z");
await seedWorkout(alice, "Bench in progress", activeStarted, null, [
  { templateId: bench.id, position: 0, sets: [{ weightKg: "200", reps: 1 }] },
]);
benchPrevious = (await getPreviousPerformances(db, alice, [bench.id])).get(bench.id);
check(
  "an unfinished workout is never a source",
  benchPrevious?.sets[0].weight_kg === "110.000" && benchPrevious?.performedAt.getTime() === newerStarted.getTime(),
  JSON.stringify(benchPrevious?.sets),
);
check(
  "the unfinished workout's values do not leak",
  !benchPrevious?.sets.some((set) => set.weight_kg === "200.000"),
);

// ---- a different user's history is never visible ---------------------------
const bobStarted = new Date("2026-02-01T10:00:00Z");
await seedWorkout(bob, "Bob bench", bobStarted, hourAfter(bobStarted), [
  { templateId: bench.id, position: 0, sets: [{ weightKg: "300", reps: 2 }] },
]);
benchPrevious = (await getPreviousPerformances(db, alice, [bench.id])).get(bench.id);
check(
  "a different user's history is never visible",
  benchPrevious?.sets[0].weight_kg === "110.000" && benchPrevious?.performedAt.getTime() === newerStarted.getTime(),
);
check(
  "the owner still sees their own history",
  (await getPreviousPerformances(db, bob, [bench.id])).get(bench.id)?.sets[0].weight_kg === "300.000",
);
check(
  "a user with no history sees nothing of anyone else's",
  (await getPreviousPerformances(db, carol, [bench.id])).size === 0,
);

// ---- every field a set can carry resolves ----------------------------------
const weightExercise = await mkExercise(alice, "Test Weight Reps", "weight_reps");
const durationExercise = await mkExercise(alice, "Test Duration", "duration");
const distanceExercise = await mkExercise(alice, "Test Distance", "distance_duration");
const floorsExercise = await mkExercise(alice, "Test Floors", "floors_duration");
const stepsExercise = await mkExercise(alice, "Test Steps", "steps_duration");

const typesStarted = new Date("2026-03-01T10:00:00Z");
await seedWorkout(alice, "All types", typesStarted, hourAfter(typesStarted), [
  { templateId: weightExercise, position: 0, sets: [{ weightKg: "80.5", reps: 10, rpe: "8" }] },
  { templateId: durationExercise, position: 1, sets: [{ durationSeconds: 90 }] },
  { templateId: distanceExercise, position: 2, sets: [{ distanceMeters: 5000, durationSeconds: 1800 }] },
  { templateId: floorsExercise, position: 3, sets: [{ durationSeconds: 600, floors: 25 }] },
  { templateId: stepsExercise, position: 4, sets: [{ durationSeconds: 900, steps: 1200 }] },
]);

// One call for all five exercises: the shape the logger uses for a whole workout.
const allTypes = await getPreviousPerformances(db, alice, [
  weightExercise,
  durationExercise,
  distanceExercise,
  floorsExercise,
  stepsExercise,
]);
check("one lookup covers every requested exercise", allTypes.size === 5, `size=${allTypes.size}`);

const weightSet = allTypes.get(weightExercise)?.sets[0];
check(
  "a weight/reps set's previous carries weight, reps and rpe",
  weightSet?.weight_kg === "80.500" &&
    weightSet.reps === 10 &&
    weightSet.rpe === "8.0" &&
    weightSet.duration_seconds === null &&
    weightSet.distance_meters === null &&
    weightSet.metrics.floors === undefined &&
    weightSet.metrics.steps === undefined,
  JSON.stringify(weightSet),
);
check("weight is the numeric-as-string the schema promises", typeof weightSet?.weight_kg === "string");
if (!weightSet) bail("the weight/reps previous set exists");
check(
  "a previous set renders through the canonical formatter",
  formatSetValues(weightSet, "weight_reps") === "80.5 kg × 10 reps · RPE 8",
  formatSetValues(weightSet, "weight_reps"),
);

const durationSet = allTypes.get(durationExercise)?.sets[0];
check(
  "a duration set's previous is a time",
  durationSet?.duration_seconds === 90 &&
    durationSet.reps === null &&
    durationSet.weight_kg === null &&
    durationSet.distance_meters === null &&
    durationSet.metrics.floors === undefined &&
    durationSet.metrics.steps === undefined,
  JSON.stringify(durationSet),
);

const distanceSet = allTypes.get(distanceExercise)?.sets[0];
check(
  "a distance set's previous is a distance and a time",
  distanceSet?.distance_meters === 5000 &&
    distanceSet.duration_seconds === 1800 &&
    distanceSet.reps === null &&
    distanceSet.weight_kg === null,
  JSON.stringify(distanceSet),
);

const floorsSet = allTypes.get(floorsExercise)?.sets[0];
check(
  "a floors set's previous reads floors out of metrics",
  floorsSet?.metrics.floors === 25 &&
    floorsSet.duration_seconds === 600 &&
    floorsSet.metrics.steps === undefined &&
    floorsSet.distance_meters === null,
  JSON.stringify(floorsSet),
);

const stepsSet = allTypes.get(stepsExercise)?.sets[0];
check(
  "a steps set's previous reads steps out of metrics",
  stepsSet?.metrics.steps === 1200 &&
    stepsSet.duration_seconds === 900 &&
    stepsSet.metrics.floors === undefined &&
    stepsSet.distance_meters === null,
  JSON.stringify(stepsSet),
);

// ---- alignment: set index against the previous session ---------------------
const alignExercise = await mkExercise(alice, "Test Alignment", "weight_reps");
const alignStarted = new Date("2026-03-02T10:00:00Z");
await seedWorkout(alice, "Alignment", alignStarted, hourAfter(alignStarted), [
  {
    templateId: alignExercise,
    position: 0,
    sets: [
      { weightKg: "60", reps: 12 },
      { weightKg: "65", reps: 10 },
      { weightKg: "70", reps: 8 },
    ],
  },
]);
const aligned = (await getPreviousPerformances(db, alice, [alignExercise])).get(alignExercise);
check(
  "sets align to the current session by index",
  aligned?.sets.map((set) => set.reps).join(",") === "12,10,8",
  aligned?.sets.map((set) => set.reps).join(","),
);
check(
  "each aligned index carries its own values",
  aligned?.sets[0].weight_kg === "60.000" &&
    aligned?.sets[1].weight_kg === "65.000" &&
    aligned?.sets[2].weight_kg === "70.000",
);

// ---- only completed sets, and only a session that has one ------------------
const partialExercise = await mkExercise(alice, "Test Partial", "weight_reps");
const partialOlderStarted = new Date("2026-04-01T10:00:00Z");
await seedWorkout(alice, "Partial older", partialOlderStarted, hourAfter(partialOlderStarted), [
  { templateId: partialExercise, position: 0, sets: [{ weightKg: "50", reps: 5 }] },
]);
// A newer completed workout that includes the exercise but never logged it: the
// routine's prescribed values are on the row, completed_at is null.
const partialNewerStarted = new Date("2026-04-08T10:00:00Z");
await seedWorkout(alice, "Partial newer", partialNewerStarted, hourAfter(partialNewerStarted), [
  { templateId: partialExercise, position: 0, sets: [{ weightKg: "99", reps: 1, completedAt: null }] },
]);
const partial = (await getPreviousPerformances(db, alice, [partialExercise])).get(partialExercise);
check(
  "a finished workout with no completed sets is not a previous performance",
  partial?.performedAt.getTime() === partialOlderStarted.getTime(),
  partial?.performedAt.toISOString(),
);
check(
  "prescribed values on an unfinished set never surface",
  partial?.sets[0].weight_kg === "50.000" && !partial?.sets.some((set) => set.weight_kg === "99.000"),
);

const mixedExercise = await mkExercise(alice, "Test Mixed", "weight_reps");
const mixedStarted = new Date("2026-05-01T10:00:00Z");
await seedWorkout(alice, "Mixed", mixedStarted, hourAfter(mixedStarted), [
  {
    templateId: mixedExercise,
    position: 0,
    sets: [
      { weightKg: "80", reps: 5 },
      { weightKg: "999", reps: 1, completedAt: null },
    ],
  },
]);
const mixed = (await getPreviousPerformances(db, alice, [mixedExercise])).get(mixedExercise);
check(
  "only completed sets are a previous performance",
  mixed?.sets.length === 1 && mixed.sets[0].weight_kg === "80.000" && mixed.sets[0].reps === 5,
  JSON.stringify(mixed?.sets),
);

// ---- the result is bounded by one session ----------------------------------
const bulkExercise = await mkExercise(alice, "Test Bulk", "weight_reps");
const bulkOlderStarted = new Date("2026-06-01T10:00:00Z");
await seedWorkout(alice, "Bulk older", bulkOlderStarted, hourAfter(bulkOlderStarted), [
  { templateId: bulkExercise, position: 0, sets: [{ weightKg: "10", reps: 1 }] },
]);
const bulkNewerStarted = new Date("2026-06-08T10:00:00Z");
await seedWorkout(alice, "Bulk newer", bulkNewerStarted, hourAfter(bulkNewerStarted), [
  {
    templateId: bulkExercise,
    position: 0,
    sets: Array.from({ length: 40 }, (_, index) => ({ weightKg: "40", reps: index + 1 })),
  },
]);
const bulk = await getPreviousPerformances(db, alice, [bulkExercise, bench.id]);
check(
  "only the most recent session is returned, not the whole history",
  bulk.get(bulkExercise)?.sets.length === 40,
  `${bulk.get(bulkExercise)?.sets.length}`,
);
check(
  "a session with many sets does not affect another exercise's result",
  bulk.get(bench.id)?.sets.length === 2,
  `${bulk.get(bench.id)?.sets.length}`,
);

// ---- missing history is absent, not zero -----------------------------------
const neverExercise = await mkExercise(alice, "Test Never", "weight_reps");
const withMissing = await getPreviousPerformances(db, alice, [neverExercise, bench.id]);
check("missing history yields no entry rather than a zero", !withMissing.has(neverExercise));
check("an exercise with history is still returned alongside it", withMissing.has(bench.id));

await close();

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
