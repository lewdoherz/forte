import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionUserId } from "@/lib/auth-session";
import { getUserProfile } from "@/lib/users";
import { listRoutines } from "@/lib/routines";
import { listWorkouts, type WorkoutSummary } from "@/lib/workouts";
import { enrichWorkoutCards } from "@/lib/workout-history";
import { getEarnedRecordsForWorkouts, type EarnedRecord } from "@/lib/records-history";
import { recordCategoryLabel } from "@/lib/records";
import { formatDateTime, formatDayAndMonth, formatNumber, formatWeekdayShort } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/lib/timezone";
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
 *
 * Everything it prints is translated, and every number and date is formatted
 * for the reader's locale in the account's own time zone.
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
  const { locale, t } = await getI18n();
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

  // The strip's labels come from the shared, locale-aware formatters. The day
  // number on its own has no helper, so it keeps the formatter-per-render shape
  // the two hardcoded ones had.
  const dayOfMonthFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone });
  const activityDays = dayBounds.slice(0, 7).map((date, index) => ({
    date,
    weekday: formatWeekdayShort(locale, date, timeZone),
    label: formatDayAndMonth(locale, date, timeZone),
    dayOfMonth: dayOfMonthFormatter.format(date),
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
        title: exerciseTitles.get(record.templateId) ?? t("dashboard.records.unknownExercise"),
        category: recordCategoryLabel(record.category, locale),
        date: entry.card.started_at,
      })),
    )
    .slice(0, RECENT_RECORDS);

  const activeWorkout = activeCards[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-4 [&_a]:focus-visible:outline-zinc-700 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-4 [&_button]:focus-visible:outline-zinc-700">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="mt-1 break-words text-sm text-zinc-600 sm:text-base">
            {displayName
              ? t("dashboard.greeting.named", { name: displayName })
              : t("dashboard.greeting.guest")}
          </p>
        </div>
        <Link
          href="/progress"
          className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium hover:bg-zinc-50"
        >
          {t("dashboard.viewProgress")}
        </Link>
      </header>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="next-workout-heading"
          className="flex min-w-0 flex-col justify-between rounded-2xl bg-zinc-900 p-5 text-white sm:p-6 [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-white [&_a]:focus-visible:ring-offset-4 [&_a]:focus-visible:ring-offset-zinc-900 [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-white [&_button]:focus-visible:ring-offset-4 [&_button]:focus-visible:ring-offset-zinc-900"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {t(activeWorkout ? "dashboard.hero.eyebrowActive" : "dashboard.hero.eyebrowIdle")}
            </p>
            <h2 id="next-workout-heading" className="mt-3 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {activeWorkout ? activeWorkout.title : t("dashboard.hero.titleIdle")}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-300">
              {t(activeWorkout ? "dashboard.hero.bodyActive" : "dashboard.hero.bodyIdle")}
            </p>
            {activeWorkout ? (
              <p className="mt-3 text-xs text-zinc-400">
                {t("dashboard.hero.started", {
                  date: formatDateTime(locale, activeWorkout.started_at, timeZone),
                })}
                {" · "}
                {t("common.plural.exercises", { count: activeWorkout.exerciseCount })}
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {activeWorkout ? (
              <Link
                href={`/workouts/${activeWorkout.id}`}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                {t("dashboard.hero.resume")} <span aria-hidden="true" className="ml-3">→</span>
              </Link>
            ) : (
              <form action={startEmptyWorkoutFormAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
                >
                  {t("dashboard.hero.startEmpty")} <span aria-hidden="true" className="ml-3">→</span>
                </button>
              </form>
            )}
            <Link
              href="/routines"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-zinc-200 underline decoration-zinc-500 underline-offset-4 hover:text-white"
            >
              {t("dashboard.hero.chooseRoutine")}
            </Link>
          </div>
        </section>

        <section aria-labelledby="activity-heading" className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="activity-heading" className="text-base font-semibold">{t("dashboard.activity.title")}</h2>
            <span className="text-xs text-zinc-500">
              {activityDays[0].label} – {activityDays[6].label}
            </span>
          </div>
          <ol className="mt-4 grid grid-cols-7 gap-1" aria-label={t("dashboard.activity.listLabel")}>
            {activityDays.map((day) => (
              <li
                key={day.date.toISOString()}
                aria-label={t("dashboard.activity.dayLabel", {
                  weekday: day.weekday,
                  date: day.label,
                  today: day.today ? t("dashboard.activity.todaySuffix") : "",
                  count: day.count,
                })}
                className={`flex min-w-0 flex-col items-center rounded-lg py-2 ${day.today ? "bg-zinc-100 ring-1 ring-inset ring-zinc-200" : ""}`}
              >
                <span aria-hidden="true" className="text-[10px] font-medium text-zinc-500 sm:text-xs">{day.weekday}</span>
                <span
                  aria-hidden="true"
                  className={`mt-2 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${day.count > 0 ? "bg-emerald-100 text-emerald-900" : "bg-zinc-100 text-zinc-400"}`}
                >
                  {day.count > 0 ? formatNumber(locale, day.count) : "–"}
                </span>
                <span aria-hidden="true" className={`mt-1 text-[10px] ${day.today ? "font-semibold text-zinc-700" : "text-zinc-500"}`}>
                  {day.today ? t("common.today") : day.dayOfMonth}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 break-words text-xs text-zinc-500">
            {t("dashboard.activity.footnote", { timeZone: timeZone.replaceAll("_", " ") })}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-zinc-100 pt-4">
            <div className="min-w-0">
              <dt className="text-xs text-zinc-500">{t("dashboard.metric.workouts")}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(locale, weekTotals.workouts)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-zinc-500">{t("dashboard.metric.sets")}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(locale, weekTotals.sets)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-zinc-500">{t("dashboard.metric.volume")}</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums">
                {t("common.quantity", {
                  value: formatNumber(locale, weekTotals.volumeKg),
                  unit: t("common.unit.kg"),
                })}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-zinc-500">{t("dashboard.metric.records")}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(locale, weekTotals.records)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {activeCards.length > 1 ? (
        <section aria-label={t("dashboard.moreActive.label")} className="mt-5">
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
                <h2 id="quick-start-heading" className="text-lg font-semibold">{t("dashboard.quickStart.title")}</h2>
                <p className="mt-0.5 text-sm text-zinc-500">{t("dashboard.quickStart.subtitle")}</p>
              </div>
              <Link href="/routines" className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900">
                {t("dashboard.quickStart.allRoutines")}
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
                      {t("common.plural.exercises", { count: routine.exercise_count })}
                    </p>
                    <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-zinc-600">
                      {routine.exercise_names.length > 0
                        ? routine.exercise_names.join(" · ")
                        : t("dashboard.quickStart.routineHint")}
                    </p>
                    <form action={startWorkoutFormAction} className="mt-auto pt-4">
                      <input type="hidden" name="routineId" value={routine.id} />
                      <button
                        type="submit"
                        aria-label={t("dashboard.quickStart.startLabel", { title: routine.title })}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-zinc-100 px-3 text-sm font-medium hover:bg-zinc-200"
                      >
                        {t("dashboard.quickStart.start")} <span aria-hidden="true">→</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5">
                <h3 className="font-medium">{t("dashboard.quickStart.emptyTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {t("dashboard.quickStart.emptyBody")}
                </p>
                <Link
                  href="/routines/new"
                  className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
                >
                  {t("dashboard.quickStart.emptyCta")}
                </Link>
              </div>
            )}
          </section>

          <section aria-labelledby="recent-workouts-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="recent-workouts-heading" className="text-lg font-semibold">{t("dashboard.recent.title")}</h2>
              <Link href="/workouts" className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900">
                {t("dashboard.recent.all")}
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
                <h3 className="font-medium">{t("dashboard.recent.emptyTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {t("dashboard.recent.emptyBody")}
                </p>
                <Link href="/exercises" className="mt-3 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900">
                  {t("dashboard.recent.emptyCta")} <span aria-hidden="true" className="ml-2">→</span>
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="recent-records-heading" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="recent-records-heading" className="text-lg font-semibold">{t("dashboard.records.title")}</h2>
              <span className="text-xs text-zinc-500">{t("dashboard.records.subtitle")}</span>
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
                      <span className="text-xs text-zinc-500">{formatDateTime(locale, record.date, timeZone)}</span>
                      <Link
                        href={`/workouts/${record.workoutId}`}
                        aria-label={t("dashboard.records.viewWorkoutLabel", {
                          title: record.title,
                          category: record.category,
                        })}
                        className="inline-flex min-h-11 items-center rounded-md text-xs font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
                      >
                        {t("dashboard.records.viewWorkout")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-xl bg-zinc-50 p-4">
                <h3 className="text-sm font-medium">{t("dashboard.records.emptyTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {t("dashboard.records.emptyBody")}
                </p>
                <Link href="/progress" className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900">
                  {t("dashboard.records.emptyCta")}
                </Link>
              </div>
            )}
          </section>

          <section aria-labelledby="training-tools-heading" className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <h2 id="training-tools-heading" className="text-base font-semibold">{t("dashboard.tools.title")}</h2>
            <div className="mt-3 space-y-2">
              <Link href="/routines/new" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white p-3 hover:bg-zinc-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("dashboard.tools.createRoutine.title")}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{t("dashboard.tools.createRoutine.body")}</p>
                </div>
                <span aria-hidden="true" className="shrink-0 text-zinc-500">→</span>
              </Link>
              <Link href="/exercises" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white p-3 hover:bg-zinc-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("dashboard.tools.browseExercises.title")}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{t("dashboard.tools.browseExercises.body")}</p>
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
