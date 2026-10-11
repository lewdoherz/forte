import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionUserId } from "@/lib/auth-session";
import { getUserProfile } from "@/lib/users";
import { listRoutines } from "@/lib/routines";
import { listWorkouts, type WorkoutSummary } from "@/lib/workouts";
import { enrichWorkoutCards } from "@/lib/workout-history";
import { getEarnedRecordsForWorkouts, type EarnedRecord } from "@/lib/records-history";
import { RECORD_CATEGORY_LABELS } from "@/lib/records";
import { DEFAULT_TIME_ZONE, formatDateTimeInTimeZone, startOfLocalDay } from "@/lib/timezone";
import { formatVolumeKg } from "@/lib/workout-stats";
import { startEmptyWorkoutFormAction, startWorkoutFormAction } from "@/lib/workout-actions";
import { WorkoutCard, type WorkoutCardData } from "@/components/workout-card";

/**
 * The dashboard: what to do next, how the last week went, and what was recently
 * earned.
 *
 * It defines no metric of its own. The cards, the volume, the completed-set
 * count and the records all come from the same history projection, summariser
 * and Records engine the Workouts list and the exercise tabs use — a total here
 * and a total there cannot disagree, because they are the same numbers.
 */

/** Completed workouts the "Recent" section lists. */
const RECENT_WORKOUTS = 4;
/** Earned records the "Recent PRs" section lists. */
const RECENT_RECORDS = 5;
/** Pages of history walked while covering the seven-day window (pages are 30). */
const WINDOW_PAGE_LIMIT = 4;
/** Routines offered as one-tap starts before deferring to the routines list. */
const QUICK_START_ROUTINES = 4;

/** A history row with its rendered card, paired once and reused by every section. */
interface HistoryEntry {
  summary: WorkoutSummary;
  card: WorkoutCardData;
}

export default async function DashboardPage() {
  const userId = await requireSessionUserId();
  const [profile, routines] = await Promise.all([
    getUserProfile(db, userId),
    listRoutines(db, userId),
  ]);
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;

  // Seven local calendar days ending today, via the same calendar-space offset
  // every range control uses, so the window cannot drift across a DST change.
  const windowStart = startOfLocalDay(new Date(), timeZone, { days: -(7 - 1) });

  // Pages are walked only until the window is covered: the seven-day totals need
  // every workout finished inside it, and the loop stops at the first workout
  // that started before the window opened. The cap bounds the work rather than
  // the answer — it is four times the page size of a very busy training week.
  const history: HistoryEntry[] = [];
  let activeCards: WorkoutCardData[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < WINDOW_PAGE_LIMIT; page++) {
    const historyPage = await listWorkouts(db, userId, { cursor });
    if (page === 0) activeCards = await enrichWorkoutCards(db, userId, historyPage.active);
    const cards = await enrichWorkoutCards(db, userId, historyPage.completed);
    historyPage.completed.forEach((summary, index) => {
      history.push({ summary, card: cards[index] });
    });
    cursor = historyPage.nextCursor;
    const oldest = historyPage.completed.at(-1);
    if (cursor === null || (oldest && oldest.started_at < windowStart)) break;
  }

  const week = history.filter(
    ({ summary }) => summary.ended_at !== null && summary.ended_at >= windowStart,
  );
  const weekTotals = {
    workouts: week.length,
    sets: week.reduce((total, { summary }) => total + summary.completed_set_count, 0),
    volumeKg: week.reduce((total, { card }) => total + card.volumeKg, 0),
    records: week.reduce((total, { card }) => total + (card.recordCount ?? 0), 0),
  };
  const recent = history.slice(0, RECENT_WORKOUTS);

  // The newest workouts' earned records, named by the exercise they belong to.
  // `getEarnedRecordsForWorkouts` is the Records engine's own answer for a batch
  // of workouts; the titles come from the same catalog rows the cards read.
  const earned: Map<string, EarnedRecord[]> =
    recent.length > 0
      ? await getEarnedRecordsForWorkouts(
          db,
          userId,
          recent.map(({ summary }) => summary.id),
        )
      : new Map();
  const recordedTemplates = [...new Set([...earned.values()].flat().map((r) => r.templateId))];
  const exerciseTitles =
    recordedTemplates.length > 0
      ? new Map(
          (
            await db
              .selectFrom("exercise_template")
              .select(["id", "title"])
              .where("id", "in", recordedTemplates)
              .where((eb) => eb.or([eb("owner_id", "is", null), eb("owner_id", "=", userId)]))
              .execute()
          ).map((row) => [row.id, row.title]),
        )
      : new Map<string, string>();
  const recentRecords = recent
    .flatMap((entry) =>
      (earned.get(entry.summary.id) ?? []).map((record) => ({
        key: `${entry.summary.id}:${record.templateId}:${record.category}`,
        title: exerciseTitles.get(record.templateId) ?? "Exercise",
        category: RECORD_CATEGORY_LABELS[record.category],
        date: entry.card.started_at,
      })),
    )
    .slice(0, RECENT_RECORDS);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {activeCards.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-zinc-500">In progress</h2>
          <ul className="mt-2 space-y-2">
            {activeCards.map((card) => (
              <li key={card.id}>
                <WorkoutCard card={card} timeZone={timeZone} active />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-medium text-zinc-500">Start</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <form action={startEmptyWorkoutFormAction}>
            <button
              type="submit"
              className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
            >
              Start empty workout
            </button>
          </form>
          {routines.slice(0, QUICK_START_ROUTINES).map((routine) => (
            <form key={routine.id} action={startWorkoutFormAction}>
              <input type="hidden" name="routineId" value={routine.id} />
              <button
                type="submit"
                className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
              >
                {routine.title}
              </button>
            </form>
          ))}
          <Link
            href="/routines"
            className="flex h-11 items-center rounded-md px-4 text-sm font-medium text-zinc-600 underline"
          >
            {routines.length > QUICK_START_ROUTINES ? "All routines" : "Routines"}
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-500">Last 7 days</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <dt className="text-xs text-zinc-500">Workouts</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{weekTotals.workouts}</dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <dt className="text-xs text-zinc-500">Completed sets</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{weekTotals.sets}</dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <dt className="text-xs text-zinc-500">Volume</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {formatVolumeKg(weekTotals.volumeKg)}
            </dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <dt className="text-xs text-zinc-500">Records</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{weekTotals.records}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-500">Recent workouts</h2>
          <Link href="/workouts" className="text-sm text-zinc-500 underline">
            All workouts
          </Link>
        </div>
        {recent.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {recent.map(({ summary, card }) => (
              <li key={summary.id}>
                <WorkoutCard card={card} timeZone={timeZone} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-zinc-500">
            No finished workouts yet. Start one above and it will appear here.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-500">Recent PRs</h2>
        {recentRecords.length > 0 ? (
          <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
            {recentRecords.map((record) => (
              <li
                key={record.key}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3"
              >
                <span className="min-w-0 break-words text-sm font-medium">{record.title}</span>
                <span className="text-sm text-zinc-600">{record.category}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatDateTimeInTimeZone(record.date, timeZone)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-zinc-500">
            No records yet. A record appears once a workout beats an earlier one for the same
            exercise — a first performance has nothing to beat.
          </p>
        )}
      </section>
    </main>
  );
}
