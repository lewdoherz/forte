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
  const now = new Date();
  const dayBounds = Array.from({ length: 8 }, (_, index) =>
    startOfLocalDay(now, timeZone, { days: index - 6 }),
  );
  const windowStart = dayBounds[0];

  // Recent history keeps its existing start-time ordering. The weekly query
  // separately filters by finish time so a long-running session is not lost.
  const historyPage = await listWorkouts(db, userId);
  const recentSummaries = historyPage.completed.slice(0, RECENT_WORKOUTS);
  const [activeCards, recentCards] = await Promise.all([
    enrichWorkoutCards(db, userId, historyPage.active),
    enrichWorkoutCards(db, userId, recentSummaries),
  ]);
  const recent: HistoryEntry[] = recentSummaries.map((summary, index) => ({
    summary,
    card: recentCards[index],
  }));
  const weekTotals = { workouts: 0, sets: 0, volumeKg: 0, records: 0 };
  const activityCounts = Array<number>(7).fill(0);
  let cursor: string | null = null;
  do {
    const weekPage = await listWorkouts(db, userId, {
      cursor,
      finishedFrom: windowStart,
      finishedBefore: dayBounds[7],
    });
    const cards = await enrichWorkoutCards(db, userId, weekPage.completed);
    weekPage.completed.forEach((summary, index) => {
      weekTotals.workouts++;
      weekTotals.sets += summary.completed_set_count;
      weekTotals.volumeKg += cards[index].volumeKg;
      weekTotals.records += cards[index].recordCount ?? 0;
      const endedAt = summary.ended_at;
      if (endedAt) {
        for (let day = 0; day < 7; day++) {
          if (endedAt >= dayBounds[day] && endedAt < dayBounds[day + 1]) {
            activityCounts[day]++;
            break;
          }
        }
      }
    });
    cursor = weekPage.nextCursor;
  } while (cursor !== null);

  const weekdayFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone });
  const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone });
  const activityDays = dayBounds.slice(0, 7).map((date, index) => ({
    date,
    weekday: weekdayFormatter.format(date),
    label: dateFormatter.format(date),
    dayOfMonth: dateFormatter.formatToParts(date).find((part) => part.type === "day")?.value,
    count: activityCounts[index],
    today: index === 6,
  }));
  const displayName = profile?.display_name?.trim();

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
        workoutId: entry.summary.id,
        templateId: record.templateId,
        exerciseVisible: exerciseTitles.has(record.templateId),
        title: exerciseTitles.get(record.templateId) ?? "Exercise",
        category: RECORD_CATEGORY_LABELS[record.category],
        date: entry.card.started_at,
      })),
    )
    .slice(0, RECENT_RECORDS);

  const activeWorkout = activeCards[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-4 [&_a]:focus-visible:outline-zinc-700 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-4 [&_button]:focus-visible:outline-zinc-700">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 break-words text-sm text-zinc-600 sm:text-base">
            {displayName ? `Welcome, ${displayName}.` : "Welcome to forte."} Your next workout starts here.
          </p>
        </div>
        <Link
          href="/progress"
          className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium hover:bg-zinc-50"
        >
          View progress
        </Link>
      </header>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="next-workout-heading"
          className="flex min-w-0 flex-col justify-between rounded-2xl bg-zinc-900 p-5 text-white sm:p-6 [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-white [&_a]:focus-visible:ring-offset-4 [&_a]:focus-visible:ring-offset-zinc-900 [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-white [&_button]:focus-visible:ring-offset-4 [&_button]:focus-visible:ring-offset-zinc-900"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {activeWorkout ? "Workout in progress" : "Make time for your next session"}
            </p>
            <h2 id="next-workout-heading" className="mt-3 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {activeWorkout ? activeWorkout.title : "Ready when you are."}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-300">
              {activeWorkout
                ? "Pick up where you left off. Your workout is ready to continue."
                : "Start with a blank workout, or choose a routine below to bring your planned exercises along."}
            </p>
            {activeWorkout ? (
              <p className="mt-3 text-xs text-zinc-400">
                Started {formatDateTimeInTimeZone(activeWorkout.started_at, timeZone)}
                {" · "}
                {activeWorkout.exerciseCount} {activeWorkout.exerciseCount === 1 ? "exercise" : "exercises"}
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {activeWorkout ? (
              <Link
                href={`/workouts/${activeWorkout.id}`}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                Resume workout <span aria-hidden="true" className="ml-3">→</span>
              </Link>
            ) : (
              <form action={startEmptyWorkoutFormAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
                >
                  Start empty workout <span aria-hidden="true" className="ml-3">→</span>
                </button>
              </form>
            )}
            <Link
              href="/routines"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-zinc-200 underline decoration-zinc-500 underline-offset-4 hover:text-white"
            >
              Choose a routine
            </Link>
          </div>
        </section>

        <section aria-labelledby="activity-heading" className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="activity-heading" className="text-base font-semibold">Last 7 days</h2>
            <span className="text-xs text-zinc-500">
              {activityDays[0].label} – {activityDays[6].label}
            </span>
          </div>
          <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Finished workouts by day">
            {activityDays.map((day) => (
              <li
                key={day.date.toISOString()}
                aria-label={`${day.weekday}, ${day.label}${day.today ? ", today" : ""}: ${day.count} finished ${day.count === 1 ? "workout" : "workouts"}`}
                className={`flex min-w-0 flex-col items-center rounded-lg py-2 ${day.today ? "bg-zinc-100 ring-1 ring-inset ring-zinc-200" : ""}`}
              >
                <span aria-hidden="true" className="text-[10px] font-medium text-zinc-500 sm:text-xs">{day.weekday}</span>
                <span
                  aria-hidden="true"
                  className={`mt-2 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${day.count > 0 ? "bg-emerald-100 text-emerald-900" : "bg-zinc-100 text-zinc-400"}`}
                >
                  {day.count > 0 ? day.count : "–"}
                </span>
                <span aria-hidden="true" className={`mt-1 text-[10px] ${day.today ? "font-semibold text-zinc-700" : "text-zinc-500"}`}>
                  {day.today ? "Today" : day.dayOfMonth}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 break-words text-xs text-zinc-500">Finished sessions · {timeZone.replaceAll("_", " ")}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-zinc-100 pt-4">
            <div className="min-w-0">
              <dt className="text-xs text-zinc-500">Workouts</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{weekTotals.workouts}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-zinc-500">Completed sets</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{weekTotals.sets}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-zinc-500">Volume</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums">{formatVolumeKg(weekTotals.volumeKg)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-zinc-500">Records</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{weekTotals.records}</dd>
            </div>
          </dl>
        </section>
      </div>

      {activeCards.length > 1 ? (
        <section aria-label="Other workouts in progress" className="mt-5">
          <ul className="grid gap-3 sm:grid-cols-2">
            {activeCards.slice(1).map((card) => (
              <li key={card.id} className="min-w-0">
                <WorkoutCard card={card} timeZone={timeZone} active />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="quick-start-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="quick-start-heading" className="text-lg font-semibold">Quick start</h2>
                <p className="mt-0.5 text-sm text-zinc-500">Your routines, ready to train.</p>
              </div>
              <Link href="/routines" className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900">
                All routines
              </Link>
            </div>
            {routines.length > 0 ? (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {routines.slice(0, QUICK_START_ROUTINES).map((routine) => (
                  <li key={routine.id} className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <Link
                      href={`/routines/${routine.id}`}
                      className="flex min-h-11 items-center rounded-md wrap-anywhere font-semibold hover:underline"
                    >
                      {routine.title}
                    </Link>
                    <p className="mt-1 text-xs font-medium text-zinc-500">
                      {routine.exercise_count} {routine.exercise_count === 1 ? "exercise" : "exercises"}
                    </p>
                    <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-zinc-600">
                      {routine.exercise_names.length > 0
                        ? routine.exercise_names.join(" · ")
                        : "Add exercises to this routine, or start and build as you go."}
                    </p>
                    <form action={startWorkoutFormAction} className="mt-auto pt-4">
                      <input type="hidden" name="routineId" value={routine.id} />
                      <button
                        type="submit"
                        aria-label={`Start ${routine.title}`}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-zinc-100 px-3 text-sm font-medium hover:bg-zinc-200"
                      >
                        Start routine <span aria-hidden="true">→</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5">
                <h3 className="font-medium">Build a routine that fits you</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Pick your exercises once, then start your next session with the plan already in place.
                </p>
                <Link
                  href="/routines/new"
                  className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
                >
                  Create your first routine
                </Link>
              </div>
            )}
          </section>

          <section aria-labelledby="recent-workouts-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="recent-workouts-heading" className="text-lg font-semibold">Recent workouts</h2>
              <Link href="/workouts" className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900">
                All workouts
              </Link>
            </div>
            {recent.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {recent.map(({ summary, card }) => (
                  <li key={summary.id} className="min-w-0">
                    <WorkoutCard card={card} timeZone={timeZone} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="font-medium">Your training history starts here</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Finish a workout to see its exercises, completed sets and summary here. Sessions in progress stay at the top of your dashboard.
                </p>
                <Link href="/exercises" className="mt-3 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900">
                  Find exercises for your first session <span aria-hidden="true" className="ml-2">→</span>
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="recent-records-heading" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="recent-records-heading" className="text-lg font-semibold">Recent PRs</h2>
              <span className="text-xs text-zinc-500">Earned in recent workouts</span>
            </div>
            {recentRecords.length > 0 ? (
              <ul className="mt-3 divide-y divide-zinc-100">
                {recentRecords.map((record) => (
                  <li key={record.key} className="py-3">
                    <p className="text-xs font-medium text-emerald-800">{record.category}</p>
                    <Link
                      href={record.exerciseVisible ? `/exercises/${record.templateId}?tab=statistics` : `/workouts/${record.workoutId}`}
                      className="flex min-h-11 items-center rounded-md wrap-anywhere text-sm font-semibold hover:underline"
                    >
                      {record.title}
                    </Link>
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                      <span className="text-xs text-zinc-500">{formatDateTimeInTimeZone(record.date, timeZone)}</span>
                      <Link
                        href={`/workouts/${record.workoutId}`}
                        aria-label={`View workout for ${record.title}: ${record.category}`}
                        className="inline-flex min-h-11 items-center rounded-md text-xs font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
                      >
                        View workout
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-xl bg-zinc-50 p-4">
                <h3 className="text-sm font-medium">Progress worth remembering</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  A PR appears when a finished workout beats an earlier performance for the same exercise. Your first performance sets the baseline, not a record to beat.
                </p>
                <Link href="/progress" className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900">
                  Explore your exercise statistics
                </Link>
              </div>
            )}
          </section>

          <section aria-labelledby="training-tools-heading" className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <h2 id="training-tools-heading" className="text-base font-semibold">Make your next session easier</h2>
            <div className="mt-3 space-y-2">
              <Link href="/routines/new" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white p-3 hover:bg-zinc-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Create a routine</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">Plan exercises and sets for next time.</p>
                </div>
                <span aria-hidden="true" className="shrink-0 text-zinc-500">→</span>
              </Link>
              <Link href="/exercises" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white p-3 hover:bg-zinc-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Browse exercises</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">Find movements and review how to do them.</p>
                </div>
                <span aria-hidden="true" className="shrink-0 text-zinc-500">→</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
