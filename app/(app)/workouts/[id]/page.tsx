import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkoutTree } from "@/lib/workouts";
import { getVocabularies } from "@/lib/exercises";
import { requireSessionUserId } from "@/lib/auth-session";
import { WorkoutLogger } from "@/components/workout-logger";
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

  const [{ muscles }, profile] = await Promise.all([getVocabularies(db), getUserProfile(db, userId)]);
  // The owner's zone, so times read the same here as on the history list.
  const timeZone = profile?.timezone ?? DEFAULT_TIME_ZONE;

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
