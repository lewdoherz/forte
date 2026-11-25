import Link from "next/link";
import { requireSessionUserId } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { listRoutines } from "@/lib/routines";
import { getActiveWorkout } from "@/lib/workouts";
import { startEmptyWorkoutFormAction, startWorkoutFormAction } from "@/lib/workout-actions";
import { WorkoutResumeLink } from "@/components/app-frame";
import { NavigationIcon } from "@/components/bottom-nav";

export default async function WorkoutPage() {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const [routines, activeWorkout] = await Promise.all([
    listRoutines(db, userId),
    getActiveWorkout(db, userId),
  ]);

  return (
    <main className="training mx-auto min-w-0 max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t("nav.workout")}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{t("common.workoutHub.subtitle")}</p>
      </header>
      {activeWorkout ? (
        <div className="mb-4">
          <WorkoutResumeLink
            workout={{
              id: activeWorkout.id,
              title: activeWorkout.title,
              startedAt: activeWorkout.started_at.toISOString(),
            }}
          />
        </div>
      ) : null}
      <form action={startEmptyWorkoutFormAction}>
        <button
          type="submit"
          className="training-action flex min-h-16 w-full items-center gap-3 rounded-2xl px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-text)]"
        >
          <NavigationIcon name="workout" className="h-7 w-7 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{t("common.workoutHub.startEmpty")}</span>
            <span className="mt-0.5 block text-sm opacity-85">{t("common.workoutHub.startHint")}</span>
          </span>
          <span aria-hidden="true" className="text-xl">+</span>
        </button>
      </form>
      <section aria-labelledby="routine-heading" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="routine-heading" className="text-xl font-semibold">{t("common.workoutHub.routines")}</h2>
          <Link href="/routines" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-text)] underline underline-offset-4">
            {t("common.workoutHub.manage")}
          </Link>
        </div>
        {routines.length > 0 ? (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {routines.map((routine) => (
              <li key={routine.id} className="training-panel flex min-w-0 flex-col rounded-2xl p-4">
                <Link href={`/routines/${routine.id}`} className="flex min-h-11 items-center break-words text-base font-semibold hover:underline">
                  {routine.title}
                </Link>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t("common.plural.exercises", { count: routine.exercise_count })}
                </p>
                <p className="mt-2 line-clamp-2 break-words text-sm text-[var(--text-muted)]">
                  {routine.exercise_names.length ? routine.exercise_names.join(" · ") : t("common.workoutHub.noExercises")}
                </p>
                <form action={startWorkoutFormAction} className="mt-auto pt-4">
                  <input type="hidden" name="routineId" value={routine.id} />
                  <button
                    type="submit"
                    aria-label={t("common.workoutHub.startRoutineLabel", { title: routine.title })}
                    className="training-elevated flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)]"
                  >
                    {t("common.workoutHub.startRoutine")}
                    <span aria-hidden="true">→</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="training-panel mt-3 rounded-2xl border-dashed p-5 text-sm leading-relaxed text-[var(--text-muted)]">
            {t("common.workoutHub.empty")}
          </p>
        )}
        <Link
          href="/routines/new"
          className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold hover:bg-[var(--bg-surface)]"
        >
          <span aria-hidden="true">+</span>
          {t("common.workoutHub.create")}
        </Link>
      </section>
    </main>
  );
}
