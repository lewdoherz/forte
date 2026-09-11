import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkoutTree } from "@/lib/workouts";
import { getVocabularies } from "@/lib/exercises";
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

  const [profile, { muscles }] = await Promise.all([
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
    return <WorkoutDetail workout={workout} timeZone={timeZone} muscles={muscles} />;
  }

  // The logger runs in the browser, so the vocabulary crosses the boundary as a
  // plain array — a Map would not survive it.
  return (
    <WorkoutLogger
      initial={workout}
      userId={userId}
      timeZone={timeZone}
      muscles={muscles.map((muscle) => ({
        code: muscle.code,
        display_name: muscle.display_name,
      }))}
    />
  );
}
