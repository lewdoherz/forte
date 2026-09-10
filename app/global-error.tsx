"use client";

import "./globals.css";

/**
 * Root error boundary. It replaces the root layout, so it must render its own
 * <html>/<body> and import the global stylesheet itself — global styles are not
 * inherited here.
 *
 * Only the digest is shown: forwarded server errors deliberately carry a
 * generic message in production, and internals must never reach the UI.
 *
 * `retry()` is preferred over `reset()` because it re-fetches and re-renders,
 * which is what actually helps when the cause was a transient server failure.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <main className="mx-auto max-w-2xl px-4 py-20">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-zinc-600">
            forte hit an unexpected error and could not finish loading. Trying again often
            works.
          </p>

          {error.digest ? (
            <p className="mt-6 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
              Reference <span className="font-mono">{error.digest}</span> — quote this if you
              report the problem.
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
      </body>
    </html>
  );
}
