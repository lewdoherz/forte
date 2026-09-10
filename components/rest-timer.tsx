"use client";

import { useEffect, useState } from "react";

/**
 * Rest countdown for the active workout.
 *
 * The countdown is anchored to the SERVER's completion timestamp for the most
 * recently completed set, so it stays correct across a reload, a re-render, or
 * the revalidation that follows every server action — no client state has to
 * survive those. Rest therefore needs no server-side session state of its own:
 * `workout_set.completed_at` already records when the set finished.
 *
 * sessionStorage holds only the user's OVERRIDES — a manual restart, or a
 * skipped rest — keyed by workout. A closed tab ends them, matching the intent
 * that rest is not persisted beyond the session.
 *
 * Alerting is visual only. Audio would be blocked without a user gesture and a
 * vibration could not be made opt-out without a preferences screen, so neither
 * is triggered; the remaining time is announced with aria-live instead.
 */
interface RestTimerProps {
  workoutId: string;
  /** When the most recently completed set finished, or null if none yet. */
  anchor: string | null;
  /** Rest target snapshotted on that set's exercise; null when unset. */
  restSeconds: number | null;
  /** False once the workout has been finished — clears any stored override. */
  workoutActive: boolean;
}

interface RestOverride {
  manualStart: number | null;
  skippedAnchor: string | null;
}

const storageKey = (workoutId: string) => `forte:rest:${workoutId}`;

function readOverride(workoutId: string): RestOverride {
  try {
    const raw = window.sessionStorage.getItem(storageKey(workoutId));
    if (!raw) return { manualStart: null, skippedAnchor: null };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { manualStart: null, skippedAnchor: null };
    const { manualStart, skippedAnchor } = parsed as Record<string, unknown>;
    return {
      manualStart: typeof manualStart === "number" ? manualStart : null,
      skippedAnchor: typeof skippedAnchor === "string" ? skippedAnchor : null,
    };
  } catch {
    // Private mode or storage disabled: the timer still runs, it just cannot
    // remember an override across a reload.
    return { manualStart: null, skippedAnchor: null };
  }
}

function writeOverride(workoutId: string, value: RestOverride): void {
  try {
    if (value.manualStart === null && value.skippedAnchor === null) {
      window.sessionStorage.removeItem(storageKey(workoutId));
      return;
    }
    window.sessionStorage.setItem(storageKey(workoutId), JSON.stringify(value));
  } catch {
    // As above — overrides are an enhancement, never a requirement.
  }
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RestTimer({ workoutId, anchor, restSeconds, workoutActive }: RestTimerProps) {
  // Both sessionStorage and the wall clock are client-only. Neither is touched
  // until just after paint, so the first client render matches the server's and
  // no state is assigned synchronously inside an effect.
  const [now, setNow] = useState<number | null>(null);
  const [override, setOverride] = useState<RestOverride>({ manualStart: null, skippedAnchor: null });

  useEffect(() => {
    const task = setTimeout(() => {
      setNow(Date.now());
      setOverride(readOverride(workoutId));
    }, 0);
    return () => clearTimeout(task);
  }, [workoutId]);

  // A finished workout leaves nothing to rest for.
  useEffect(() => {
    if (!workoutActive) writeOverride(workoutId, { manualStart: null, skippedAnchor: null });
  }, [workoutActive, workoutId]);

  const hasTarget = typeof restSeconds === "number" && restSeconds > 0;
  const skipping = override.skippedAnchor !== null && override.skippedAnchor === anchor;
  const startedAt = override.manualStart ?? (anchor ? Date.parse(anchor) : null);
  const remaining =
    now !== null && hasTarget && startedAt !== null
      ? restSeconds - Math.floor((now - startedAt) / 1000)
      : 0;
  const running = workoutActive && hasTarget && !skipping && remaining > 0;

  useEffect(() => {
    if (!workoutActive) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [workoutActive]);

  const apply = (next: RestOverride) => {
    setOverride(next);
    writeOverride(workoutId, next);
  };

  if (now === null || !workoutActive) return null;

  if (!running) {
    // Offer a manual rest even when the last set is long finished: people rest
    // without completing a set.
    return (
      <button
        type="button"
        onClick={() => apply({ manualStart: Date.now(), skippedAnchor: null })}
        disabled={!hasTarget}
        className="h-9 shrink-0 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 disabled:opacity-40"
      >
        Rest {hasTarget ? formatRemaining(restSeconds) : "—"}
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span
        className="rounded-md bg-sky-100 px-2 py-1 text-xs font-medium tabular-nums text-sky-900"
        aria-live="polite"
      >
        Rest {formatRemaining(remaining)}
      </span>
      <button
        type="button"
        onClick={() => apply({ manualStart: null, skippedAnchor: anchor })}
        aria-label="Skip rest"
        className="h-9 rounded-md px-2 text-xs font-medium text-zinc-600 underline"
      >
        Skip
      </button>
    </span>
  );
}
