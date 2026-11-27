import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { getUserProfile } from "@/lib/users";
import { getVocabularies, listExercises } from "@/lib/exercises";
import { getRoutineTree, listRoutineFolders, listRoutines } from "@/lib/routines";
import { getActiveWorkout, getWorkoutTree, listWorkouts } from "@/lib/workouts";
import { getPreviousPerformances, type PreviousPerformance } from "@/lib/previous-performance";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import { isPlaceholderEmail } from "@/lib/auth-email";

export const dynamic = "force-dynamic";

/**
 * Returns the authenticated user's offline-capable dataset (catalog, routines,
 * active workout, recent completed workouts, and previous performances) so the
 * device can operate cleanly after cold-launching in airplane mode.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const userId = session.user.id;
  const [profile, { muscles, equipment }, exercises, folders, routineSummaries, activeSummary, historyPage] =
    await Promise.all([
      getUserProfile(db, userId),
      getVocabularies(db),
      listExercises(db, userId, {}),
      listRoutineFolders(db, userId),
      listRoutines(db, userId),
      getActiveWorkout(db, userId),
      listWorkouts(db, userId),
    ]);

  const [routineTrees, activeWorkout, recentWorkoutTrees] = await Promise.all([
    Promise.all(routineSummaries.map((r) => getRoutineTree(db, r.id, userId))),
    activeSummary ? getWorkoutTree(db, activeSummary.id, userId) : Promise.resolve(undefined),
    Promise.all(
      historyPage.completed.slice(0, 80).map((w) => getWorkoutTree(db, w.id, userId)),
    ),
  ]);

  const routines = routineTrees.filter((r): r is NonNullable<typeof r> => r !== undefined);
  const recentWorkouts = recentWorkoutTrees.filter(
    (w): w is NonNullable<typeof w> => w !== undefined,
  );

  // Preload previous performance for exercises in routines, active workout, and recent workouts.
  const templateIds = new Set<string>();
  for (const routine of routines) {
    for (const ex of routine.exercises) templateIds.add(ex.template_id);
  }
  if (activeWorkout) {
    for (const ex of activeWorkout.exercises) templateIds.add(ex.template_id);
  }
  for (const workout of recentWorkouts.slice(0, 10)) {
    for (const ex of workout.exercises) templateIds.add(ex.template_id);
  }

  const perfMap = await getPreviousPerformances(db, userId, [...templateIds]);
  const previousPerformances: Record<string, PreviousPerformance> = {};
  for (const [id, perf] of perfMap) previousPerformances[id] = perf;

  const displayName =
    (profile?.display_name ?? session.user.name ?? "").trim() ||
    (isPlaceholderEmail(session.user.email) ? "Forte" : session.user.email);

  return NextResponse.json(
    {
      profile: {
        id: userId,
        email: isPlaceholderEmail(session.user.email) ? "" : session.user.email,
        displayName,
        timeZone: profile?.timezone ?? DEFAULT_TIME_ZONE,
        locale: profile?.locale ?? "en",
      },
      muscles: muscles.map((m) => ({ code: m.code, display_name: m.display_name })),
      equipment: equipment.map((e) => ({ code: e.code, display_name: e.display_name })),
      exercises: exercises.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        primary_muscle: e.primary_muscle,
        secondary_muscles: e.secondary_muscles,
        equipment: e.equipment,
        exercise_type: e.exercise_type,
        how_to: e.how_to,
        media_url: e.media_url,
        duration_record_direction: e.duration_record_direction,
        is_custom: e.is_custom,
      })),
      folders,
      routines,
      activeWorkout: activeWorkout ?? null,
      recentWorkouts,
      previousPerformances,
      cachedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
