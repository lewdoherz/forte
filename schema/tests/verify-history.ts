import {
  addSet,
  finishWorkout,
  getWorkoutTree,
  HISTORY_PAGE_SIZE,
  listLoggedExercises,
  listWorkouts,
  logSet,
  startWorkout,
  summarizeWorkout,
} from "../../lib/workouts";
import { createRoutine } from "../../lib/routines";
import { createTestDatabase } from "./harness";

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

/**
 * The inverse of `expectThrow`: a throw becomes a failed check so one broken
 * guard cannot abort the rest of the suite with an unhandled rejection.
 */
async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    check(label, false, error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

function bail(msg: string): never {
  failed++;
  out.push(`FAIL  ${msg}`);
  console.log(out.join("\n"));
  process.exit(1);
}

const { db, query, close, dialect } = await createTestDatabase();
check(`schema migrations apply (${dialect})`, true);

const mkUser = async (email: string) =>
  (await query<{ id: string }>(`insert into app_user (email) values ($1) returning id`, [email])).rows[0].id;
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

// ---- history pagination ----------------------------------------------------
// Seeded straight from SQL: the paging checks are about `started_at` order and
// page boundaries, so the fixtures need exact timestamps rather than the
// server's clock. Each is one minute older than the last, which makes the
// keyset order total and lets the id tie-break stay untested.
const pageFixtures = HISTORY_PAGE_SIZE + 3;
const seedEpoch = Date.UTC(2026, 2, 1, 12, 0, 0);
const seedAt = (index: number) => new Date(seedEpoch - index * 60_000);

/** One workout row, optionally with its exercises; `finished` false is an active one. */
async function seedWorkout(
  ownerId: string,
  title: string,
  startedAt: Date,
  exercises: string[] = [],
  finished = true,
) {
  const endedAt = finished ? new Date(startedAt.getTime() + 45 * 60_000) : null;
  const { rows } = await query<{ id: string }>(
    `insert into workout (owner_id, title, started_at, ended_at) values ($1, $2, $3, $4) returning id`,
    [ownerId, title, startedAt.toISOString(), endedAt ? endedAt.toISOString() : null],
  );
  const id = rows[0].id;
  for (let position = 0; position < exercises.length; position++) {
    await query(`insert into workout_exercise (workout_id, template_id, position) values ($1, $2, $3)`, [
      id,
      exercises[position],
      position,
    ]);
  }
  return id;
}

const carol = await mkUser("carol@example.com");
const legPress = sys.find((e) => e.title === "Leg Press");
if (!legPress) bail("paging fixtures present");

let carolSquatOnlyId = "";
for (let index = 0; index < pageFixtures; index++) {
  // The oldest workout holds only the squat, giving the filter a row to exclude.
  const isOldest = index === pageFixtures - 1;
  const id = await seedWorkout(carol, `Carol session ${index}`, seedAt(index), isOldest ? [squat.id] : [bench.id]);
  if (isOldest) carolSquatOnlyId = id;
}
// Newer than every finished row, so it would lead the first page if the query
// ever folded the active workout into `completed`.
const carolActiveId = await seedWorkout(carol, "Carol in progress", seedAt(-1), [legPress.id], false);

// The oracle is a single unpaged query, so a cursor that drops, repeats or
// reorders a row fails against the same rows the walk is meant to cover.
const { rows: expectedRows } = await query<{ id: string }>(
  `select id from workout where owner_id = $1 and ended_at is not null order by started_at desc, id desc`,
  [carol],
);
const expectedIds = expectedRows.map((row) => row.id);
if (expectedIds.length !== pageFixtures) bail("paging fixtures present");

const firstPage = await listWorkouts(db, carol);
check(
  "a full page is returned and a cursor is offered",
  firstPage.completed.length === HISTORY_PAGE_SIZE && firstPage.nextCursor !== null,
  `completed=${firstPage.completed.length}`,
);

const pagedIds = firstPage.completed.map((w) => w.id);
let cursor = firstPage.nextCursor;
let pages = 1;
while (cursor && pages < 10) {
  const page = await listWorkouts(db, carol, { cursor });
  pagedIds.push(...page.completed.map((w) => w.id));
  cursor = page.nextCursor;
  pages++;
}
check("following cursors terminates at the oldest workout", cursor === null, `pages=${pages}`);
check(
  "paging returns every workout exactly once",
  pagedIds.length === expectedIds.length && new Set(pagedIds).size === pagedIds.length,
  `${pagedIds.length} rows`,
);
check(
  "paging order matches an unpaged listing",
  pagedIds.length === expectedIds.length && pagedIds.every((id, i) => id === expectedIds[i]),
);

const shortPage = await listWorkouts(db, alice);
check(
  "history shorter than a page offers no cursor",
  shortPage.completed.length > 0 && shortPage.completed.length < HISTORY_PAGE_SIZE && shortPage.nextCursor === null,
  `${shortPage.completed.length} rows`,
);

check(
  "the active workout is returned as active, not history",
  firstPage.active.length === 1 && firstPage.active[0].id === carolActiveId,
);
check(
  "completed history contains only finished workouts",
  firstPage.completed.every((w) => w.ended_at !== null && w.id !== carolActiveId),
);
check(
  "an active workout does not consume a page slot",
  firstPage.completed.length === HISTORY_PAGE_SIZE,
  `completed=${firstPage.completed.length} with an active workout present`,
);

const malformedCursorPage = await attempt("a malformed cursor does not throw", () =>
  listWorkouts(db, carol, { cursor: "garbage" }),
);
check(
  "a malformed cursor yields the newest page",
  !!malformedCursorPage &&
    malformedCursorPage.completed.length === firstPage.completed.length &&
    malformedCursorPage.completed.every((w, i) => w.id === firstPage.completed[i].id) &&
    malformedCursorPage.nextCursor === firstPage.nextCursor,
);

const malformedFilterPage = await attempt("a malformed exercise id does not throw", () =>
  listWorkouts(db, carol, { exerciseId: "not-a-uuid" }),
);
check(
  "a malformed exercise id applies no filter",
  !!malformedFilterPage &&
    malformedFilterPage.completed.length === firstPage.completed.length &&
    malformedFilterPage.completed.every((w, i) => w.id === firstPage.completed[i].id),
);

// ---- history exercise filter -----------------------------------------------
const deadlift = sys.find((e) => e.title === "Deadlift");
const pushUp = sys.find((e) => e.title === "Push-Up");
if (!deadlift || !pushUp) bail("filter fixtures present");

// Erin's history is small enough to assert the filtered set exactly: the two
// bench workouts must come back and the squat-only one must not.
const erin = await mkUser("erin@example.com");
const erinBench1 = await seedWorkout(erin, "Erin bench 1", seedAt(10), [bench.id]);
const erinBench2 = await seedWorkout(erin, "Erin bench 2", seedAt(9), [bench.id]);
const erinSquat = await seedWorkout(erin, "Erin squat", seedAt(8), [squat.id]);
const erinFiltered = await listWorkouts(db, erin, { exerciseId: bench.id });
check(
  "the exercise filter keeps only workouts containing it",
  erinFiltered.completed.length === 2 &&
    erinFiltered.completed[0].id === erinBench2 &&
    erinFiltered.completed[1].id === erinBench1 &&
    erinFiltered.completed.every((w) => w.id !== erinSquat) &&
    erinFiltered.nextCursor === null,
  erinFiltered.completed.map((w) => w.title).join(","),
);

// Carol's history is longer than a page, so filtering her by bench spans two
// pages — the case where a cursor that forgets the filter returns the squat-only
// workout on the second page.
const { rows: expectedBenchRows } = await query<{ id: string }>(
  `select w.id from workout w
   where w.owner_id = $1 and w.ended_at is not null
     and exists (select 1 from workout_exercise we where we.workout_id = w.id and we.template_id = $2)
   order by w.started_at desc, w.id desc`,
  [carol, bench.id],
);
const filteredIds: string[] = [];
let filteredCursor: string | null = null;
let filteredPages = 0;
do {
  const page = await listWorkouts(db, carol, { cursor: filteredCursor, exerciseId: bench.id });
  filteredIds.push(...page.completed.map((w) => w.id));
  filteredCursor = page.nextCursor;
  filteredPages++;
} while (filteredCursor && filteredPages < 10);
check(
  "the exercise filter pages through its matching set exactly",
  filteredIds.length === expectedBenchRows.length && filteredIds.every((id, i) => id === expectedBenchRows[i].id),
  `${filteredIds.length} rows`,
);
check(
  "the exercise filter never returns the excluded workout",
  expectedIds.includes(carolSquatOnlyId) && !filteredIds.includes(carolSquatOnlyId),
);
check(
  "the filtered walk spans more than one page and terminates",
  filteredPages === Math.ceil(expectedBenchRows.length / HISTORY_PAGE_SIZE) && filteredCursor === null,
  `pages=${filteredPages}`,
);

// ---- logged exercises for the filter menu ----------------------------------
// Bob logs a movement nobody else does, so his rows are the ones erin's list
// must not gain.
await seedWorkout(bob, "Bob deadlifts", seedAt(20), [deadlift.id]);
const erinLogged = await listLoggedExercises(db, erin);
check(
  "logged exercises are exactly the user's own finished workouts' exercises",
  erinLogged.length === 2 && erinLogged[0].id === squat.id && erinLogged[1].id === bench.id,
  erinLogged.map((e) => e.title).join(","),
);
check("logged exercises exclude another user's", !erinLogged.some((e) => e.id === deadlift.id));
check("logged exercises exclude catalog entries nobody has logged", !erinLogged.some((e) => e.id === pushUp.id));
const bobLogged = await listLoggedExercises(db, bob);
check("another user's logged exercises are their own", bobLogged.length === 1 && bobLogged[0].id === deadlift.id);
const carolLogged = await listLoggedExercises(db, carol);
check(
  "logged exercises ignore the active workout",
  carolLogged.length === 2 &&
    carolLogged[0].id === squat.id &&
    carolLogged[1].id === bench.id &&
    !carolLogged.some((e) => e.id === legPress.id),
  carolLogged.map((e) => e.title).join(","),
);

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
