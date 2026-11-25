import { requireSessionUserId } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { listRoutineFolders, listRoutines } from "@/lib/routines";
import { getActiveWorkout } from "@/lib/workouts";
import { startEmptyWorkoutFormAction } from "@/lib/workout-actions";
import { WorkoutResumeLink } from "@/components/app-frame";
import { NavigationIcon } from "@/components/bottom-nav";
import { RoutineFolderManager } from "@/components/routine-folder-manager";

export default async function WorkoutPage() {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const [folders, routines, activeWorkout] = await Promise.all([
    listRoutineFolders(db, userId),
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
      <RoutineFolderManager folders={folders} routines={routines} />
    </main>
  );
}
