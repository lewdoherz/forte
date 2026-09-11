"use client";

import { useState, useTransition } from "react";
import { loadWorkoutPageAction } from "@/lib/workout-actions";
import { WorkoutCard, type WorkoutCardData } from "@/components/workout-card";

/**
 * The completed-workout list, newest first.
 *
 * Older pages are appended through a server action rather than navigated to:
 * reading back through training is a scrolling task, and replacing the list
 * would lose the reader's place. The parent keys this component on the filter, so
 * changing the filter starts a fresh list instead of appending to the old one.
 *
 * The card data (duration, volume, exercise previews) is built on the server and
 * arrives ready to render; this component only owns the paging state. Times are
 * formatted inside the card in the owner's stored zone rather than the ambient
 * one, which keeps the markup identical on the server and in the browser.
 */
export function WorkoutHistory({
  initial,
  initialCursor,
  exerciseId,
  timeZone,
}: {
  initial: WorkoutCardData[];
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
        {items.map((w) => (
          <li key={w.id}>
            <WorkoutCard card={w} timeZone={timeZone} />
          </li>
        ))}
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
