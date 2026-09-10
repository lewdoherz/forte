import { createTestDatabase } from "./harness";
import { createRoutine } from "../../lib/routines";
import { finishWorkout, getWorkoutTree, logSet, startWorkout } from "../../lib/workouts";
import { getSessionSeries, rangeStart } from "../../lib/progress";
import {
  DEFAULT_TIME_ZONE,
  formatDateTimeInTimeZone,
  isValidTimeZone,
  startOfLocalDay,
} from "../../lib/timezone";

/**
 * Timezone-aware calendar bucketing: local day boundaries, DST transitions,
 * range lower bounds, and the end-to-end effect on /progress' data.
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

const applied = await query<{ n: number }>("select count(*)::int as n from app_user");
check(`schema migrations apply (${dialect})`, Number(applied.rows[0].n) === 0);

const iso = (date: Date | null) => (date === null ? "null" : date.toISOString());

// ---- validation ------------------------------------------------------------
check("accepts a real IANA zone", isValidTimeZone("America/Chicago"));
check("accepts UTC", isValidTimeZone("UTC"));
check("rejects a bogus zone", !isValidTimeZone("Not/AZone"));
check("rejects an empty zone", !isValidTimeZone(""));
check("default zone is an explicit UTC", DEFAULT_TIME_ZONE === "UTC");

// ---- start of the local calendar day ---------------------------------------
check(
  "UTC day boundary",
  iso(startOfLocalDay(new Date("2026-01-15T12:00:00Z"), "UTC")) === "2026-01-15T00:00:00.000Z",
);
check(
  "fixed-offset winter boundary (Chicago CST, UTC-6)",
  iso(startOfLocalDay(new Date("2026-01-15T12:00:00Z"), "America/Chicago")) ===
    "2026-01-15T06:00:00.000Z",
);
check(
  "would-be-next-day instant in UTC is still the previous local day in Tokyo",
  iso(startOfLocalDay(new Date("2026-01-15T12:00:00Z"), "Asia/Tokyo")) ===
    "2026-01-14T15:00:00.000Z",
);
check(
  "early-morning UTC belongs to the previous local day west of UTC",
  iso(startOfLocalDay(new Date("2026-01-15T03:00:00Z"), "America/Chicago")) ===
    "2026-01-14T06:00:00.000Z",
);

// ---- DST transitions -------------------------------------------------------
// US DST 2026: begins Sun 8 Mar, ends Sun 1 Nov.
check(
  "spring-forward day starts at the pre-transition offset",
  iso(startOfLocalDay(new Date("2026-03-08T12:00:00Z"), "America/Chicago")) ===
    "2026-03-08T06:00:00.000Z",
);
check(
  "fall-back day starts at the pre-transition offset",
  iso(startOfLocalDay(new Date("2026-11-01T12:00:00Z"), "America/Chicago")) ===
    "2026-11-01T05:00:00.000Z",
);
check(
  "30-day offset is calendar-space, crossing a transition",
  iso(startOfLocalDay(new Date("2026-03-15T12:00:00Z"), "America/Chicago", { days: -30 })) ===
    "2026-02-13T06:00:00.000Z",
);
check(
  "1-year offset uses the offset in effect a year earlier (naive ms maths would be wrong)",
  iso(startOfLocalDay(new Date("2026-03-15T12:00:00Z"), "America/Chicago", { years: -1 })) ===
    "2025-03-15T05:00:00.000Z",
);

// ---- range lower bounds ----------------------------------------------------
const now = new Date("2026-01-15T12:00:00Z");
check("range 'all' has no lower bound", rangeStart("all", now, "UTC") === null);
check(
  "range '30d' starts at the user's local day boundary",
  iso(rangeStart("30d", now, "Asia/Tokyo")) === "2025-12-15T15:00:00.000Z",
);
check(
  "range '90d' starts at the user's local day boundary",
  iso(rangeStart("90d", now, "Asia/Tokyo")) === "2025-10-16T15:00:00.000Z",
);
check(
  "the same range resolves to different instants per zone",
  iso(rangeStart("30d", now, "Asia/Tokyo")) !== iso(rangeStart("30d", now, "UTC")),
);

// ---- rendering -------------------------------------------------------------
const midnightish = new Date("2026-01-15T03:00:00Z");
check(
  "rendering differs between zones",
  formatDateTimeInTimeZone(midnightish, "America/Chicago") !==
    formatDateTimeInTimeZone(midnightish, "UTC"),
  `${formatDateTimeInTimeZone(midnightish, "America/Chicago")} / ${formatDateTimeInTimeZone(midnightish, "UTC")}`,
);

// ---- end-to-end: the stored zone drives /progress bucketing ----------------
const ZONE = "Asia/Tokyo";
const inserted = await query<{ id: string }>(
  "insert into app_user (email, timezone) values ($1, $2) returning id",
  ["tz@example.com", ZONE],
);
const alice = inserted.rows[0].id;

const benchRow = await query<{ id: string }>(
  "select id from exercise_template where title = 'Bench Press' limit 1",
);
const bench = benchRow.rows[0]?.id;
if (!bench) bail("bench fixture present");

const routine = await createRoutine(db, alice, {
  title: "TZ routine",
  notes: null,
  exercises: [
    {
      template_id: bench,
      rest_seconds: null,
      notes: null,
      sets: [{ set_type: "normal", reps: 5, weight_kg: "50" }],
    },
  ],
});

const started = await startWorkout(db, alice, routine.id);
const tree = await getWorkoutTree(db, started.id, alice);
if (!tree) bail("workout tree exists");
await logSet(db, alice, { setId: tree.exercises[0].sets[0].id, reps: 5, weight_kg: "50", rpe: null });
await finishWorkout(db, alice, started.id);

// Compare the SAME session through two zones. The two range boundaries are
// always >=9h apart, so an instant one hour before the later boundary is
// provably inside the earlier zone's window and outside the later one's —
// whichever way round they fall for the wall-clock time the suite runs at.
// (Tokyo's boundary is earlier than UTC's when both share a calendar date, and
// 15h later once Tokyo has rolled over to the next day.)
const boundaryUtc = startOfLocalDay(new Date(), "UTC", { days: -30 });
const boundaryTokyo = startOfLocalDay(new Date(), ZONE, { days: -30 });
const [earlier, later] =
  boundaryTokyo.getTime() < boundaryUtc.getTime()
    ? [
        { zone: ZONE, at: boundaryTokyo },
        { zone: "UTC", at: boundaryUtc },
      ]
    : [
        { zone: "UTC", at: boundaryUtc },
        { zone: ZONE, at: boundaryTokyo },
      ];

const probe = new Date(later.at.getTime() - 60 * 60 * 1000);
await db
  .updateTable("workout")
  .set({ started_at: probe, ended_at: new Date(probe.getTime() + 60 * 60 * 1000) })
  .where("id", "=", started.id)
  .execute();

const inRows = await getSessionSeries(db, alice, bench, "30d", earlier.zone);
check(
  `a session inside the ${earlier.zone} 30-day window is included`,
  inRows.some((r) => r.workoutId === started.id),
);
const outRows = await getSessionSeries(db, alice, bench, "30d", later.zone);
check(
  `the same session is outside the ${later.zone} 30-day window`,
  !outRows.some((r) => r.workoutId === started.id),
);
check(
  "the stored zone — not the server's — decides the bucket",
  earlier.zone !== later.zone,
);

const allRows = await getSessionSeries(db, alice, bench, "all", ZONE);
check("timezone never drops data from the all-time range", allRows.some((r) => r.workoutId === started.id));

const unknown = await getSessionSeries(db, alice, bench, "30d", DEFAULT_TIME_ZONE);
check("an explicit UTC default is applied when no zone is supplied", Array.isArray(unknown));

await close();

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
