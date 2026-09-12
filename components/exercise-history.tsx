import Link from "next/link";
import type { SetType } from "@/schema/types";
import { db } from "@/lib/db";
import { RECORD_CATEGORY_LABELS } from "@/lib/records";
import { formatDateTimeInTimeZone } from "@/lib/timezone";
import { formatSetValues } from "@/lib/workout-stats";
import { EXERCISE_HISTORY_SESSION_LIMIT, getExerciseHistory } from "@/lib/exercise-history";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

/**
 * The History tab: one card per completed session, newest first, showing this
 * exercise's completed sets in order and the records the session earned for it.
 *
 * The values are rendered by `formatSetValues` with the exercise's own type, so
 * every set type is formatted by the same code the logger's previous-performance
 * column uses — the tab adds no second set-type mapping. The record indicators
 * are the Records engine's own outcomes, filtered to this exercise: one per
 * (exercise, category), derived on read and never stored, so deleting or
 * editing history recalculates them with no badge state to maintain.
 *
 * The whole card is the link to the completed workout — the name and the card
 * are one tap target — which is the same convention the workout history list
 * uses. No nested control lives inside the link, so the markup stays valid.
 */
export async function ExerciseHistory({
  userId,
  exerciseId,
  exerciseTitle,
  timeZone,
}: {
  userId: string;
  exerciseId: string;
  exerciseTitle: string;
  timeZone: string;
}) {
  const { exerciseType, sessions } = await getExerciseHistory(db, userId, exerciseId);

  if (exerciseType === null || sessions.length === 0) {
    return <p className="text-zinc-500">No workouts include {exerciseTitle} yet.</p>;
  }

  return (
    <>
      <ul className="space-y-4">
        {sessions.map((session) => (
          <li key={session.workoutId}>
            <Link
              href={`/workouts/${session.workoutId}`}
              className="block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm hover:border-zinc-400"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0 break-words font-medium">{session.title}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatDateTimeInTimeZone(session.date, timeZone)}
                </span>
              </div>

              {session.records.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-2">
                  {session.records.map((category) => (
                    <span
                      key={category}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
                    >
                      <span className="font-semibold">PR</span>
                      <span>{RECORD_CATEGORY_LABELS[category]}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                {session.sets.map((set, index) => (
                  <li
                    key={index}
                    className="flex items-start justify-between gap-3 px-4 py-2 text-sm"
                  >
                    <span className="shrink-0 text-[11px] text-zinc-500">
                      {SET_TYPE_LABELS[set.setType]}
                    </span>
                    <span className="min-w-0 break-words text-right tabular-nums">
                      {formatSetValues(set, exerciseType)}
                    </span>
                  </li>
                ))}
              </ul>
            </Link>
          </li>
        ))}
      </ul>

      {sessions.length >= EXERCISE_HISTORY_SESSION_LIMIT ? (
        <p className="mt-4 text-center text-sm text-zinc-500">
          Showing the {EXERCISE_HISTORY_SESSION_LIMIT} most recent sessions.
        </p>
      ) : null}
    </>
  );
}
