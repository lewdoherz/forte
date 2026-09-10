"use client";

/**
 * Route-level error boundary for everything inside the protected shell. Rendered
 * within `app/(app)/layout.tsx`, so the header and navigation stay usable and
 * the user is never stranded on a dead page.
 *
 * Reassures on the one thing the user actually cares about, and shows only the
 * digest — never a message, stack or driver detail.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold">This page could not load</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Something went wrong while loading this page. Your saved workouts and routines are
        unaffected.
      </p>

      {error.digest ? (
        <p className="mt-6 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
          Reference <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
      >
        Try again
      </button>
    </main>
  );
}
