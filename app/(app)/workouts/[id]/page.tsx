import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkoutTree } from "@/lib/workouts";
import { getVocabularies, listExercises } from "@/lib/exercises";
import { getPreviousPerformances, type PreviousPerformance } from "@/lib/previous-performance";
import { getWorkoutRecords } from "@/lib/records-history";
import { requireSessionUserId } from "@/lib/auth-session";
import { WorkoutLogger } from "@/components/workout-logger";
import { WorkoutDetail } from "@/components/workout-detail";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";
import { getUserProfile } from "@/lib/users";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;
  const workout = await getWorkoutTree(db, id, userId);
  if (!workout) notFound();

  const [profile, { muscles, equipment }] = await Promise.all([
    getUserProfile(db, userId),
    getVocabularies(db),
  ]);
  // The owner's zone, so times read the same here as on the history list.
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;

  // A finished workout is a record, not a session to edit, so it gets the
  // read-only detail instead of the logger. Both views need the muscle
  // vocabulary — the logger for its set lines, the detail for the distribution
  // table's names and order — so it is loaded once, before the branch.
  if (workout.ended_at !== null) {
    // Earned records are derived from history strictly before this workout, so
    // they are read here rather than stored on the workout row.
    const records = await getWorkoutRecords(db, userId, workout.id);
    return (
      <WorkoutDetail
        workout={workout}
        timeZone={timeZone}
        muscles={muscles}
        records={records}
      />
    );
  }

  // The logger's own data: the visible catalog the Add Exercise picker searches,
  // and last time's values for the exercises the workout started with. An
  // exercise added mid-workout is not in `previous` yet; the logger asks for it
  // when the row is added.
  const [exercises, performances] = await Promise.all([
    listExercises(db, userId, {}),
    getPreviousPerformances(
      db,
      userId,
      workout.exercises.map((exercise) => exercise.template_id),
    ),
  ]);

  // A Map does not need to cross the server/client boundary: the logger indexes
  // by template id, which a plain record expresses directly.
  const previous: Record<string, PreviousPerformance> = {};
  for (const [templateId, performance] of performances) previous[templateId] = performance;

  return (
    <WorkoutLogger
      initial={workout}
      userId={userId}
      timeZone={timeZone}
      muscles={muscles.map((muscle) => ({
        code: muscle.code,
        display_name: muscle.display_name,
      }))}
      equipment={equipment.map((entry) => ({
        code: entry.code,
        display_name: entry.display_name,
      }))}
      library={exercises.map((exercise) => ({
        id: exercise.id,
        slug: exercise.slug,
        title: exercise.title,
        primary_muscle: exercise.primary_muscle,
        exercise_type: exercise.exercise_type,
      }))}
      previous={previous}
    />
  );
}
