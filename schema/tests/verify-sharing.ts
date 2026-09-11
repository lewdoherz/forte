import { createRoutine, deleteRoutine } from "../../lib/routines";
import {
  generateShareToken,
  getOrCreateRoutineShareToken,
  resolveRoutineShare,
  revokeRoutineShareLinks,
} from "../../lib/share";
import { createTestDatabase } from "./harness";

/**
 * Routine share links: the token lifecycle and the read-only payload.
 *
 * The suite drives the real helpers against the migrated schema, so it covers
 * the parts the public route depends on — lazy creation, reuse, revocation,
 * expiry, ownership and target isolation — without a browser. Whether the route
 * itself needs no session and mutates nothing is a routing property and is
 * checked against a running server separately.
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
check("a valid token resolves its routine", resolved?.id === routine.id);
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
  otherResolved?.id === other.id && otherResolved?.title === "Leg Day",
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
check("the fresh link resolves", (await resolveRoutineShare(db, regen!))?.id === other.id);
check("the revoked link stays dead", (await resolveRoutineShare(db, otherToken)) === undefined);

// Revocation by a non-owner is a no-op: the owner's live link is untouched.
await revokeRoutineShareLinks(db, bob, routine.id);
check("a non-owner cannot revoke", (await resolveRoutineShare(db, token))?.id === routine.id);

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
