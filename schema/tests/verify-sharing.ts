import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExerciseType } from "../../schema/types";
import { createRoutine, deleteRoutine } from "../../lib/routines";
import { createCustomExercise, getVocabularies } from "../../lib/exercises";
import { muscleDistribution } from "../../lib/muscle-distribution";
import { routineSummary } from "../../lib/routine-summary";
import { SharedRoutineView } from "../../components/shared-routine-view";
import {
  generateShareToken,
  getOrCreateRoutineShareToken,
  resolveRoutineShare,
  revokeRoutineShareLinks,
} from "../../lib/share";
import { createTestDatabase } from "./harness";

/**
 * Routine share links: the token lifecycle, the read-only payload and the
 * prescribed targets it renders.
 *
 * The suite drives the real helpers against the migrated schema, so it covers
 * the parts the public route depends on — lazy creation, reuse, revocation,
 * expiry, ownership, target isolation and the ordered prescription — without a
 * browser. It also renders the route's view component to static markup, so the
 * values, headings and the absence of any id from the HTML are asserted against
 * the exact tree the route returns. Whether the route itself needs no session
 * and mutates nothing is a routing property and is checked against a running
 * server separately.
 */

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
}

const { db, query, close, dialect } = await createTestDatabase();
check(`schema migrations apply (${dialect})`, true);

// ---------------------------------------------------------------- fixtures
const mkUser = async (email: string, display: string | null) =>
  (
    await query<{ id: string }>(
      `insert into app_user (email, display_name) values ($1,$2) returning id`,
      [email, display],
    )
  ).rows[0].id;

const alice = await mkUser("alice@example.com", "Alice");
const bob = await mkUser("bob@example.com", null);

const sys = await db
  .selectFrom("exercise_template")
  .selectAll()
  .where("is_custom", "=", false)
  .execute();
const bench = sys.find((e) => e.title === "Bench Press");
const squat = sys.find((e) => e.title === "Barbell Back Squat");
check("seed fixtures present", !!bench && !!squat);

const routine = await createRoutine(db, alice, {
  title: "Push Day",
  notes: "chest focus",
  exercises: [
    {
      template_id: bench!.id,
      superset_key: "ss-a",
      rest_seconds: 120,
      notes: null,
      sets: [
        { set_type: "warmup", reps: 10, weight_kg: "40", duration_seconds: null, distance_meters: null },
        { set_type: "normal", reps: 8, weight_kg: "100", duration_seconds: null, distance_meters: null },
      ],
    },
    {
      template_id: squat!.id,
      superset_key: "ss-a",
      rest_seconds: null,
      notes: null,
      sets: [
        { set_type: "normal", reps: 5, weight_kg: "120", duration_seconds: null, distance_meters: null },
      ],
    },
  ],
});

// ------------------------------------------------------ token generation
const generated = new Set(Array.from({ length: 200 }, () => generateShareToken()));
check(
  "generated tokens are 22 URL-safe characters",
  [...generated].every((t) => t.length === 22 && /^[A-Za-z0-9_-]+$/.test(t)),
);
check("generated tokens do not repeat", generated.size === 200);

// --------------------------------------------------- lazy create and reuse
const token = (await getOrCreateRoutineShareToken(db, alice, routine.id))!;
check("first request creates a token", token.length >= 10);
check("the token is not the routine id", token !== routine.id);

const reused = await getOrCreateRoutineShareToken(db, alice, routine.id);
check("an existing active link is reused", reused === token);

const storedCount = await query<{ n: number }>(
  `select count(*)::int as n from share where routine_id = $1`,
  [routine.id],
);
check("reuse did not create a second row", storedCount.rows[0].n === 1);

check(
  "a non-owner cannot mint a link",
  (await getOrCreateRoutineShareToken(db, bob, routine.id)) === undefined,
);
check(
  "a missing routine yields no token",
  (await getOrCreateRoutineShareToken(db, alice, "00000000-0000-0000-0000-000000000001")) === undefined,
);

// ------------------------------------------------------------ resolution
const resolved = await resolveRoutineShare(db, token);
check("a valid token resolves its routine", resolved?.title === "Push Day");
check("the routine title and notes are exposed", resolved?.title === "Push Day" && resolved?.notes === "chest focus");
check(
  "exercise order follows the routine",
  resolved?.exercises.map((e) => e.title).join(",") === "Bench Press,Barbell Back Squat",
);
check(
  "superset grouping survives the share",
  resolved?.exercises[0].supersetKey === "ss-a" && resolved?.exercises[1].supersetKey === "ss-a",
);
check(
  "planned set types are exposed for the summary",
  resolved?.exercises[0].setTypes.join(",") === "warmup,normal" &&
    resolved?.exercises[1].setTypes.join(",") === "normal",
);
check(
  "the heatmap inputs (muscles) are exposed",
  resolved?.exercises[0].primaryMuscle !== undefined &&
    Array.isArray(resolved?.exercises[0].secondaryMuscles),
);
check(
  "owner attribution is the display name",
  resolved?.ownerName === "Alice",
);
check(
  "no email or private account field leaks into the payload",
  !JSON.stringify(resolved).includes("@example.com") && !JSON.stringify(resolved).includes("email"),
);

// fallback attribution: username, never the email
const noName = await query<{ id: string }>(
  `insert into app_user (email, username) values ('carol@example.com','carol') returning id`,
);
const carol = noName.rows[0].id;
const carolRoutine = await createRoutine(db, carol, {
  title: "Carol's Day",
  notes: null,
  exercises: [{ template_id: squat!.id, superset_key: null, rest_seconds: null, notes: null, sets: [] }],
});
const carolToken = (await getOrCreateRoutineShareToken(db, carol, carolRoutine.id))!;
const carolResolved = await resolveRoutineShare(db, carolToken);
check("attribution falls back to the username", carolResolved?.ownerName === "carol");

// An owner with neither a display name nor a username gets no attribution at
// all — and certainly not the email.
const bobRoutine = await createRoutine(db, bob, {
  title: "Bob's Day",
  notes: null,
  exercises: [{ template_id: squat!.id, superset_key: null, rest_seconds: null, notes: null, sets: [] }],
});
const bobToken = (await getOrCreateRoutineShareToken(db, bob, bobRoutine.id))!;
check("an owner with no public name is attributed to nobody", (await resolveRoutineShare(db, bobToken))?.ownerName === null);

// ------------------------------------------------------ target isolation
check(
  "an unknown token resolves nothing",
  (await resolveRoutineShare(db, "NoSuchToken0000000000")) === undefined,
);

const other = await createRoutine(db, alice, {
  title: "Leg Day",
  notes: null,
  exercises: [{ template_id: squat!.id, superset_key: null, rest_seconds: null, notes: null, sets: [] }],
});
const otherToken = (await getOrCreateRoutineShareToken(db, alice, other.id))!;
check("a different routine gets a different token", otherToken !== token);
const otherResolved = await resolveRoutineShare(db, otherToken);
check(
  "a token resolves only its own routine",
  otherResolved?.title === "Leg Day" && otherResolved?.notes === null,
);

// A token aimed at a workout is not a routine share.
const workoutId = (
  await query<{ id: string }>(
    `insert into workout (owner_id, title, started_at) values ($1,'Workout', now()) returning id`,
    [alice],
  )
).rows[0].id;
await query(`insert into share (token, owner_id, workout_id) values ('WorkoutToken000', $1, $2)`, [
  alice,
  workoutId,
]);
check(
  "a workout share token does not resolve as a routine",
  (await resolveRoutineShare(db, "WorkoutToken000")) === undefined,
);

// ------------------------------------------- prescribed targets (public view)
// One exercise per target shape the shared page must render, so exposing the
// prescription is proven end to end: resolve, project, then render the markup
// the route serves. The templates are custom to alice so the schema's exercise
// type — not a fixture title — decides which target fields each set carries.
const custom = (type: ExerciseType, title: string) =>
  createCustomExercise(db, alice, {
    title,
    exercise_type: type,
    primary_muscle: bench!.primary_muscle,
    secondary_muscles: [],
    equipment: bench!.equipment,
  });

const targetTemplates = {
  weight: await custom("weight_reps", "Target Weight Reps"),
  reps: await custom("reps_only", "Target Reps Only"),
  duration: await custom("duration", "Target Duration"),
  distance: await custom("distance_duration", "Target Distance Duration"),
  floors: await custom("floors_duration", "Target Floors Duration"),
  steps: await custom("steps_duration", "Target Steps Duration"),
};

const targetRoutine = await createRoutine(db, alice, {
  title: "Prescription Targets",
  notes: "one exercise per target shape",
  exercises: [
    {
      template_id: targetTemplates.weight.id,
      superset_key: null,
      rest_seconds: 120,
      notes: null,
      sets: [
        { set_type: "warmup", reps: 10, weight_kg: "40" },
        { set_type: "normal", reps: 8, weight_kg: "100" },
      ],
    },
    {
      template_id: targetTemplates.reps.id,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 12 }],
    },
    {
      template_id: targetTemplates.duration.id,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", duration_seconds: 60 }],
    },
    {
      template_id: targetTemplates.distance.id,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", distance_meters: 400, duration_seconds: 90 }],
    },
    {
      template_id: targetTemplates.floors.id,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", duration_seconds: 120, metrics: { floors: 10 } }],
    },
    {
      template_id: targetTemplates.steps.id,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", duration_seconds: 300, metrics: { steps: 500 } }],
    },
  ],
});

const targetToken = (await getOrCreateRoutineShareToken(db, alice, targetRoutine.id))!;
const targetResolved = await resolveRoutineShare(db, targetToken);
check(
  "the target routine resolves from its token",
  targetResolved?.title === "Prescription Targets",
);

const expectedOrder = [
  "Target Weight Reps",
  "Target Reps Only",
  "Target Duration",
  "Target Distance Duration",
  "Target Floors Duration",
  "Target Steps Duration",
];
check(
  "exercise order is preserved in the payload",
  targetResolved?.exercises.map((e) => e.title).join(",") === expectedOrder.join(","),
);

const setsOf = (index: number) => targetResolved!.exercises[index].sets;
check(
  "weight_reps keeps its set order and values",
  JSON.stringify(setsOf(0).map((s) => [s.setType, s.weightKg, s.reps])) ===
    JSON.stringify([
      ["warmup", "40.000", 10],
      ["normal", "100.000", 8],
    ]),
);
check(
  "reps-only targets expose reps and no weight",
  setsOf(1)[0].reps === 12 && setsOf(1)[0].weightKg === null && setsOf(1)[0].durationSeconds === null,
);
check("duration targets expose seconds", setsOf(2)[0].durationSeconds === 60);
check(
  "distance+duration targets expose metres and seconds",
  setsOf(3)[0].distanceMeters === 400 &&
    setsOf(3)[0].durationSeconds === 90 &&
    setsOf(3)[0].weightKg === null,
);
check(
  "floors_duration reads floors from metrics",
  setsOf(4)[0].floors === 10 && setsOf(4)[0].steps === null && setsOf(4)[0].durationSeconds === 120,
);
check(
  "steps_duration reads steps from metrics",
  setsOf(5)[0].steps === 500 && setsOf(5)[0].floors === null && setsOf(5)[0].durationSeconds === 300,
);
check(
  "set types are still derived for the summary",
  targetResolved?.exercises[0].setTypes.join(",") === "warmup,normal",
);
check(
  "no raw metrics or private set columns leak into the payload",
  !/metrics|rpe|routine_exercise_id|custom_metric|rep_range/.test(
    JSON.stringify(targetResolved!.exercises.flatMap((e) => e.sets)),
  ),
);

const { muscles } = await getVocabularies(db);
const targetHtml = renderToStaticMarkup(
  createElement(SharedRoutineView, { routine: targetResolved!, muscles }),
);
// renderToStaticMarkup escapes `&` in text; decode it so the assertions read as
// the page does.
const targetText = targetHtml.replace(/&amp;/g, "&");

const expectedValues = [
  "40 kg × 10 reps",
  "100 kg × 8 reps",
  "12 reps",
  "60s",
  "400 m × 90s",
  "10 floors × 120s",
  "500 steps × 300s",
];
check(
  "the rendered view shows every prescribed value",
  expectedValues.every((value) => targetText.includes(value)),
  expectedValues.filter((value) => !targetText.includes(value)).join(" | ") || undefined,
);
check(
  "the value column heading follows the exercise type",
  ["Weight & reps", "Reps", "Duration", "Distance & duration", "Floors & duration", "Steps & duration"].every(
    (heading) => targetText.includes(heading),
  ),
);
check(
  "set order is preserved in the rendered view",
  targetText.indexOf("40 kg × 10 reps") < targetText.indexOf("100 kg × 8 reps"),
);
check(
  "exercise order is preserved in the rendered view",
  expectedOrder.every(
    (title, index) => index === 0 || targetText.indexOf(expectedOrder[index - 1]) < targetText.indexOf(title),
  ),
);

const targetExerciseIds = (
  await query<{ id: string }>(
    `select id from routine_exercise where routine_id = $1`,
    [targetRoutine.id],
  )
).rows.map((row) => row.id);
const targetIds = [targetRoutine.id, ...targetExerciseIds];
check(
  "the id search covers the routine and every exercise",
  targetIds.length === 7 && targetExerciseIds.length === 6,
  `${targetIds.length} ids searched`,
);
check(
  "no routine or exercise id appears in the rendered HTML",
  targetIds.every((id) => !targetHtml.includes(id)),
  `${targetIds.length} ids searched`,
);
check(
  "no routine or exercise id appears anywhere in the payload",
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(JSON.stringify(targetResolved)),
);
check("the share token does not appear in the HTML", !targetHtml.includes(targetToken));
check("the owner email does not appear in the HTML", !targetHtml.includes("@example.com"));

// The summary and heatmap inputs are unchanged by exposing the targets: they
// still come from the muscles and set types alone. All six custom exercises are
// chest-primary with one working set each (the warm-up is not working volume),
// so a load-weighted formula would necessarily produce a different number.
const targetSummary = routineSummary(
  targetResolved!.exercises.map((e) => ({
    sets: e.setTypes.map((setType) => ({ setType })),
    restSeconds: e.restSeconds,
  })),
);
const targetDistribution = muscleDistribution(
  targetResolved!.exercises.map((e) => ({
    primaryMuscle: e.primaryMuscle,
    secondaryMuscles: e.secondaryMuscles,
    sets: e.setTypes.map((setType) => ({ setType })),
  })),
);
check(
  "muscle distribution is unchanged by exposing targets",
  targetDistribution.roles[bench!.primary_muscle] === 1 &&
    targetDistribution.sets[bench!.primary_muscle] === 6,
  `roles=${JSON.stringify(targetDistribution.roles)} sets=${JSON.stringify(targetDistribution.sets)}`,
);
check(
  "the summary still counts working sets only",
  targetSummary.exerciseCount === 6 && targetSummary.totalSets === 6,
);

check(
  "a valid token resolves and renders with no session",
  targetResolved?.ownerName === "Alice" && targetText.includes("Prescription Targets"),
);
check(
  "a wrong token cannot read the target routine",
  (await resolveRoutineShare(db, otherToken))?.title !== "Prescription Targets",
);
await query(
  `insert into share (token, owner_id, routine_id, created_at, expires_at)
   values ('TargetExpired000', $1, $2, now() - interval '2 days', now() - interval '1 day')`,
  [alice, targetRoutine.id],
);
check(
  "an expired token to the target routine resolves nothing",
  (await resolveRoutineShare(db, "TargetExpired000")) === undefined,
);

// -------------------------------------- automated revocation (integration)
// Revocation was previously only checked by hand in a browser. It is proven
// here against the real schema: the owner-scoped statement the server action
// calls, then the resolve the public route performs — an undefined resolution is
// the route's 404, so a dead token can no longer reach the view.
const revocable = await createRoutine(db, alice, {
  title: "Revoked Targets",
  notes: null,
  exercises: [
    {
      template_id: targetTemplates.reps.id,
      superset_key: null,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5 }],
    },
  ],
});
const revocableToken = (await getOrCreateRoutineShareToken(db, alice, revocable.id))!;
check(
  "a fresh link resolves before revocation",
  (await resolveRoutineShare(db, revocableToken))?.title === "Revoked Targets",
);
await revokeRoutineShareLinks(db, alice, revocable.id);
check(
  "revocation stops the link resolving (the public route's 404 path)",
  (await resolveRoutineShare(db, revocableToken)) === undefined,
);
check(
  "a revoked token is not reused",
  (await getOrCreateRoutineShareToken(db, alice, revocable.id)) !== revocableToken,
);

// ---------------------------------------------------------------- expiry
await query(
  `insert into share (token, owner_id, routine_id, created_at, expires_at)
   values ('ExpiredLink00000', $1, $2, now() - interval '2 days', now() - interval '1 day')`,
  [alice, other.id],
);
check(
  "an expired token resolves nothing",
  (await resolveRoutineShare(db, "ExpiredLink00000")) === undefined,
);
const afterExpiry = await getOrCreateRoutineShareToken(db, alice, other.id);
check(
  "an expired link is not reused; a fresh one is minted",
  afterExpiry !== undefined && afterExpiry !== "ExpiredLink00000",
);

// -------------------------------------------------------------- revocation
await revokeRoutineShareLinks(db, alice, other.id);
check("a revoked token resolves nothing", (await resolveRoutineShare(db, otherToken)) === undefined);

const regen = await getOrCreateRoutineShareToken(db, alice, other.id);
check(
  "a fresh link is minted after revocation",
  regen !== undefined && regen !== otherToken && regen !== afterExpiry,
);
check("the fresh link resolves", (await resolveRoutineShare(db, regen!))?.title === "Leg Day");
check("the revoked link stays dead", (await resolveRoutineShare(db, otherToken)) === undefined);

// Revocation by a non-owner is a no-op: the owner's live link is untouched.
await revokeRoutineShareLinks(db, bob, routine.id);
check("a non-owner cannot revoke", (await resolveRoutineShare(db, token))?.title === "Push Day");

// ---------------------------------------------------------------- cascade
await deleteRoutine(db, alice, routine.id);
check(
  "deleting the routine kills its link",
  (await resolveRoutineShare(db, token)) === undefined,
);

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
