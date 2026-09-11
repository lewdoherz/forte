"use client";

import { useEffect, useState } from "react";
import { createRoutineShareLink, revokeRoutineShareLink } from "@/lib/share-actions";

type CopyStatus =
  | "idle"
  | "copying"
  | "copied"
  | "copy_failed"
  | "revoking"
  | "revoked"
  | "revoke_failed";

/**
 * Copies a public, read-only link to the routine.
 *
 * The link is a share token resolved at `/r/<token>` with no session, so it
 * opens for anyone — not just a signed-in owner. The token is minted lazily by
 * the server action on the first copy and reused afterwards, so repeated copies
 * hand out the same URL instead of invalidating one already sent. The origin is
 * taken from the browser so the dev and deployed URLs are both correct.
 *
 * Revoking stamps every active link for the routine; the copied URL then 404s
 * and the next copy mints a fresh token. Both operations require a session and
 * are owner-scoped on the server, so this control can only ever act on the
 * routine whose page renders it.
 *
 * `navigator.clipboard` needs a secure context (https or localhost) and can
 * reject when the permission is denied or the document is not focused, so the
 * rejection is surfaced rather than swallowed.
 */
export function CopyRoutineLinkButton({ routineId }: { routineId: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    // A status is a transient acknowledgement, not persistent state: it clears
    // itself so the control stays repeatable and the card never shifts.
    if (status === "idle" || status === "copying" || status === "revoking") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const busy = status === "copying" || status === "revoking";

  async function copyLink() {
    setStatus("copying");
    try {
      const result = await createRoutineShareLink(routineId);
      if ("error" in result) {
        setStatus("copy_failed");
        return;
      }
      await navigator.clipboard.writeText(`${window.location.origin}/r/${result.token}`);
      setStatus("copied");
    } catch {
      setStatus("copy_failed");
    }
  }

  async function revokeLink() {
    setStatus("revoking");
    try {
      const result = await revokeRoutineShareLink(routineId);
      setStatus(result.error ? "revoke_failed" : "revoked");
    } catch {
      setStatus("revoke_failed");
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={copyLink}
        disabled={busy}
        className="h-11 w-full rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
      >
        Copy Routine Link
      </button>
      <button
        type="button"
        onClick={revokeLink}
        disabled={busy}
        className="mt-2 w-full text-center text-xs text-zinc-500 underline hover:text-zinc-700 disabled:opacity-60"
      >
        Revoke share link
      </button>
      {/* Reserves one line so the confirmation appearing never shifts the card. */}
      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs">
        {status === "copied" ? (
          <span className="text-emerald-700">Public link copied to clipboard.</span>
        ) : status === "revoked" ? (
          <span className="text-emerald-700">Share link revoked.</span>
        ) : status === "copy_failed" ? (
          <span className="text-red-700">Could not copy the link.</span>
        ) : status === "revoke_failed" ? (
          <span className="text-red-700">Could not revoke the link.</span>
        ) : null}
      </p>
    </div>
  );
}
