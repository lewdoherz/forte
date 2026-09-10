"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { loadWorkoutPageAction } from "@/lib/workout-actions";
import { formatDuration } from "@/lib/format";
import { formatDateTimeInTimeZone } from "@/lib/timezone";
import type { WorkoutSummary } from "@/lib/workouts";

/**
 * The completed-workout list, newest first.
 *
 * Older pages are appended through a server action rather than navigated to:
 * reading back through training is a scrolling task, and replacing the list
 * would lose the reader's place. The parent keys this component on the filter, so
 * changing the filter starts a fresh list instead of appending to the old one.
 *
 * Times are formatted in the owner's stored zone rather than the ambient one.
 * That is the correct display, and it also makes the markup identical on the
 * server and in the browser, so hydration has nothing to disagree about.
 */
export function WorkoutHistory({
  initial,
  initialCursor,
  exerciseId,
  timeZone,
}: {
  initial: WorkoutSummary[];
  initialCursor: string | null;
  exerciseId: string | null;
  timeZone: string;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadOlder() {
    startTransition(async () => {
      try {
        const page = await loadWorkoutPageAction(cursor, exerciseId);
        // De-duplicated by id: a double click before the first response lands
        // would otherwise append the same page twice.
        setItems((current) => {
          const seen = new Set(current.map((w) => w.id));
          return [...current, ...page.completed.filter((w) => !seen.has(w.id))];
        });
        setCursor(page.nextCursor);
        setError(null);
      } catch {
        setError("Could not load older workouts.");
      }
    });
  }

  return (
    <>
      <ul className="mt-2 space-y-2">
        {items.map((w) => {
          const seconds = w.ended_at
            ? Math.floor((w.ended_at.getTime() - w.started_at.getTime()) / 1000)
            : 0;
          return (
            <li key={w.id}>
              <Link
                href={`/workouts/${w.id}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-400"
              >
                <div className="break-words font-medium">{w.title}</div>
                <div className="mt-1 text-sm text-zinc-500">
                  {formatDateTimeInTimeZone(w.started_at, timeZone)} · {formatDuration(seconds)} ·{" "}
                  {w.exercise_count} {w.exercise_count === 1 ? "exercise" : "exercises"} ·{" "}
                  {w.completed_set_count}/{w.set_count} sets
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {cursor ? (
        <button
          type="button"
          onClick={loadOlder}
          disabled={pending}
          className="mt-4 h-11 w-full rounded-md border border-zinc-300 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60"
        >
          {pending ? "Loading…" : "Load older workouts"}
        </button>
      ) : (
        <p className="mt-4 text-center text-sm text-zinc-500">That is every workout.</p>
      )}
    </>
  );
}
