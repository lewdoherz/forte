"use client";

import { useEffect, useState } from "react";

type CopyStatus = "idle" | "copied" | "failed";

/**
 * Copies the current page's URL to the clipboard.
 *
 * Honest scope, deliberately: the app has no public sharing system, and this
 * does not invent one. A routine is only reachable behind `requireSession` with
 * an owner-scoped query, so `${origin}${pathname}` is a real URL that works —
 * but only for someone already signed in as the same user. Genuine public
 * sharing needs a share token with its own lifecycle plus a public route that
 * resolves it without a session; that is out of scope here. Copying the real,
 * authenticated URL is the correct behaviour for what the app currently is, and
 * it avoids a fake "public" link that would not actually open for anyone else.
 *
 * `navigator.clipboard` needs a secure context (https or localhost) and can
 * reject when the permission is denied or the document is not focused, so the
 * rejection is surfaced rather than swallowed.
 */
export function CopyRoutineLinkButton() {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    // The confirmation is a transient acknowledgement, not persistent state, so
    // it clears itself and the control remains repeatable.
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              `${window.location.origin}${window.location.pathname}`,
            );
            setStatus("copied");
          } catch {
            setStatus("failed");
          }
        }}
        className="h-11 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium hover:bg-zinc-50"
      >
        Copy Routine Link
      </button>
      {/* Reserves one line so the confirmation appearing never shifts the card. */}
      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs">
        {status === "copied" ? (
          <span className="text-emerald-700">Link copied to clipboard.</span>
        ) : status === "failed" ? (
          <span className="text-red-700">Could not copy — clipboard access was denied.</span>
        ) : null}
      </p>
    </div>
  );
}
