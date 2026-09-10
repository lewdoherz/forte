"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { SetType, WorkoutExerciseTree, WorkoutSet, WorkoutTree } from "@/schema/types";
import { openOfflineStore, type OfflineStore } from "@/lib/offline-store";
import { summarizeWorkout } from "@/lib/workout-stats";
import type { WorkoutSyncInput } from "@/lib/workout-sync";
import { syncWorkoutStateAction, type SyncFailureCode } from "@/lib/workout-actions";
import { ElapsedTimer } from "@/components/elapsed-timer";
import { RestTimer } from "@/components/rest-timer";
import { SetForm, type SetFormValues } from "@/components/set-form";
import { formatDuration } from "@/lib/format";
import { formatDateTimeInTimeZone } from "@/lib/timezone";

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: "Warm-up",
  normal: "Normal",
  failure: "Failure",
  dropset: "Drop set",
};

const EXERCISE_CARD = "rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4";

/**
 * How long edits are allowed to accumulate before one sync is sent. A fast
 * sequence of logging — record, record, undo — collapses into a single
 * reconciliation request, which is all the document-based sync needs.
 */
const SYNC_DEBOUNCE_MS = 800;

const UNREACHABLE_MESSAGE = "Could not reach the server. Your changes are kept on this device.";

/**
 * Retry schedule for a sync the server did not accept: the wait starts at two
 * seconds and doubles to a ceiling of one minute, and a success resets it. The
 * point is to survive a network that is flapping without hammering one that is
 * down once per debounce.
 */
const RETRY_BASE_MS = 2_000;
const RETRY_CEILING_MS = 60_000;

/**
 * How stale the last successful sync may be before a stored document is
 * refused. A device left signed in must not serve a week-old session as if it
 * were current.
 */
const STALE_DOCUMENT_MS = 7 * 24 * 60 * 60 * 1000;

const PERMANENT_FAILURE_SUFFIX =
  " Your changes are kept on this device, but syncing will not be retried.";

/** The quiet status line's states. */
type SyncState = "saved" | "pending" | "offline";

const SYNC_STATE_TEXT: Record<SyncState, string> = {
  saved: "All changes saved",
  pending: "Unsynced changes · kept on this device",
  offline: "Offline · changes kept on this device",
};

/**
 * Whether a stored document is too old to serve. Only consulted when a pending
 * marker exists for it, which is why an absent sync time counts as stale: a
 * document edited offline but never successfully synced has no age to trust.
 * An unparseable timestamp is treated the same way; refusing is the safe answer.
 */
function isStaleDocument(lastSyncedAt: string | null): boolean {
  if (lastSyncedAt === null) return true;
  const synced = Date.parse(lastSyncedAt);
  if (Number.isNaN(synced)) return true;
  return Date.now() - synced > STALE_DOCUMENT_MS;
}

function SetValues({ set }: { set: WorkoutSet }) {
  const parts: string[] = [];
  if (set.reps != null) parts.push(`${set.reps} reps`);
  if (set.weight_kg) parts.push(`${set.weight_kg} kg`);
  if (set.duration_seconds != null) parts.push(`${set.duration_seconds}s`);
  if (set.distance_meters != null) parts.push(`${set.distance_meters} m`);
  if (set.rpe) parts.push(`RPE ${set.rpe}`);
  return <>{parts.length > 0 ? parts.join(" · ") : "—"}</>;
}

export function WorkoutLogger({
  initial,
  userId,
  timeZone,
  muscles,
}: {
  initial: WorkoutTree;
  userId: string;
  timeZone: string;
  muscles: { code: string; display_name: string }[];
}) {
  // The server render is the first paint and a new object every request, so its
  // identity is pinned for the one mount that matters.
  const initialRef = useRef(initial);
  const [workout, setWorkout] = useState(initial);
  // The in-memory document is the source of truth for rendering and for every
  // sync; the store is its durable copy. A ref mirrors it so event handlers and
  // the sync loop read the latest value without waiting for a re-render.
  const workoutRef = useRef(initial);

  const storeRef = useRef<OfflineStore | null>(null);
  const storePromiseRef = useRef<Promise<OfflineStore> | null>(null);
  const debounceRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const rerunRef = useRef(false);
  // Bumped by every local mutation, so a sync can tell whether the document it
  // sent is still the latest one.
  const revisionRef = useRef(0);
  // One retry timer at a time, and the delay the next scheduled one will use.
  const retryTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(RETRY_BASE_MS);
  // The revision whose sync the server permanently rejected; while it is still
  // current, no trigger re-attempts the doomed request. See runSync.
  const rejectedRevisionRef = useRef<number | null>(null);
  // Lets the retry timer call the newest runSync without a circular dependency.
  const runSyncRef = useRef<() => void>(() => {});

  const [syncError, setSyncError] = useState<string | null>(null);
  // Mirrors the store's pending marker for this workout. The store stays the
  // source of truth: this is a cached read, refreshed after every write to it,
  // not a flag tracked in parallel with the store's own state.
  const [syncState, setSyncState] = useState<SyncState>("saved");

  /**
   * Re-reads the store's pending marker for this workout and mirrors it for
   * rendering. The read is what makes the indicator track the store rather than
   * a parallel flag: every write path calls this afterwards.
   */
  const refreshSyncState = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    let pending: boolean;
    try {
      pending = (await store.pendingWorkoutIds()).includes(workoutRef.current.id);
    } catch {
      // A store read failed; leave the last known state rather than inventing one.
      return;
    }
    if (!pending) {
      setSyncState("saved");
      return;
    }
    setSyncState(navigator.onLine ? "pending" : "offline");
  }, []);

  /** Clears the single retry timer, if one is pending. */
  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /**
   * Schedules the one pending retry after a failure. Never stacks: any earlier
   * timer is cleared first. A browser that reports itself offline gets no timer
   * at all — the `online` listener already fires the sync, and a timer would
   * only spin against a network that is known to be down.
   */
  const scheduleRetry = useCallback(() => {
    cancelRetry();
    if (!navigator.onLine) return;
    const delay = retryDelayRef.current;
    retryDelayRef.current = Math.min(delay * 2, RETRY_CEILING_MS);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      runSyncRef.current();
    }, delay);
  }, [cancelRetry]);

  const runSync = useCallback(async () => {
    if (syncingRef.current) {
      // A trigger arrived mid-flight; the running pass re-reads the document.
      rerunRef.current = true;
      return;
    }
    syncingRef.current = true;
    try {
      for (;;) {
        rerunRef.current = false;
        const revision = revisionRef.current;
        const store = storeRef.current;
        if (!store) return;

        // The server rejected this exact document for good. Nothing but a new
        // local edit — which bumps the revision — can change the outcome, so
        // the timer, `online` and visibility triggers all stop here.
        if (rejectedRevisionRef.current === revision) return;

        const doc = workoutRef.current;
        const input: WorkoutSyncInput = {
          workoutId: doc.id,
          endedAt: doc.ended_at ? doc.ended_at.toISOString() : null,
          sets: doc.exercises.flatMap((exercise) =>
            exercise.sets.map((set) => ({
              id: set.id,
              workout_exercise_id: set.workout_exercise_id,
              position: set.position,
              set_type: set.set_type,
              reps: set.reps,
              weight_kg: set.weight_kg,
              rpe: set.rpe,
              completed_at: set.completed_at ? set.completed_at.toISOString() : null,
            })),
          ),
        };
        let result: { ok: true } | { error: string; code: SyncFailureCode };
        rejectedRevisionRef.current = null;
        try {
          result = await syncWorkoutStateAction(input);
        } catch {
          setSyncError(UNREACHABLE_MESSAGE);
          scheduleRetry();
          void refreshSyncState();
          return;
        }
        if ("error" in result) {
          if (result.code === "permanent") {
            // The local change and its marker stay, but retrying cannot help:
            // the server would reject the same document forever.
            rejectedRevisionRef.current = revision;
            cancelRetry();
            setSyncError(`${result.error}${PERMANENT_FAILURE_SUFFIX}`);
          } else {
            // Transient. The marker stays: the local change is never discarded,
            // and the backoff timer retries it.
            setSyncError(`${result.error} Your changes are kept on this device.`);
            scheduleRetry();
          }
          void refreshSyncState();
          return;
        }

        if (revision === revisionRef.current) {
          await store.clearPending(input.workoutId);
          await store.setLastSyncedAt(new Date().toISOString());
          retryDelayRef.current = RETRY_BASE_MS;
          cancelRetry();
          setSyncError(null);
        }
        void refreshSyncState();
        // Loop while an edit landed during the request; the document that
        // reaches the server must always be the newest one.
        if (!rerunRef.current && revision === revisionRef.current) return;
      }
    } finally {
      syncingRef.current = false;
    }
  }, [cancelRetry, refreshSyncState, scheduleRetry]);

  // Publishes the newest runSync to the retry timer, which is created before it.
  useEffect(() => {
    runSyncRef.current = () => void runSync();
  }, [runSync]);

  const scheduleSync = useCallback(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void runSync();
    }, SYNC_DEBOUNCE_MS);
  }, [runSync]);

  /**
   * Writes the document to the store. The pending marker goes first: a tab that
   * dies between the two writes leaves a redundant sync, never a change with
   * nothing to send it.
   */
  const persist = useCallback(async (doc: WorkoutTree): Promise<void> => {
    const store = storeRef.current ?? (storePromiseRef.current ? await storePromiseRef.current : null);
    if (!store) return;
    await store.markPending(doc.id);
    await store.writeWorkout(doc);
    void refreshSyncState();
  }, [refreshSyncState]);

  /**
   * Local-first mutation: the document changes in memory and on disk at once,
   * and the sync follows. Returns the local write so the set form can show its
   * pending affordance until the change is durable.
   */
  const commit = useCallback(
    (next: WorkoutTree, immediate = false): Promise<void> => {
      revisionRef.current += 1;
      workoutRef.current = next;
      setWorkout(next);
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const persisted = persist(next).catch(() => {
        // IndexedDB unavailable or blocked: the in-memory document is still this
        // session's truth, and the sync does not depend on the local write.
      });
      if (immediate) void persisted.then(() => runSync());
      else void persisted.then(() => scheduleSync());
      return persisted;
    },
    [persist, runSync, scheduleSync],
  );

  // Hydrate the store once, then render from it. The first paint above already
  // came from `initial`, so there is no flash of empty content.
  useEffect(() => {
    let cancelled = false;
    const opening = openOfflineStore(userId);
    storePromiseRef.current = opening;
    opening
      .then(async (store) => {
        if (cancelled) return;
        storeRef.current = store;
        const workoutId = initialRef.current.id;
        // A document left pending by an earlier session is newer than the server
        // render this page hydrated from: it was edited after that render was
        // produced. It wins, because overwriting it would discard exactly the
        // changes the offline path exists to keep.
        const stored = await store.readWorkout(workoutId);
        const pending = stored ? await store.pendingWorkoutIds() : [];
        if (cancelled) return;

        if (stored && pending.includes(workoutId)) {
          // The stored copy is refused in exactly two cases, both from
          // docs/offline-logging.md's rule that rendering refuses a session
          // older than seven days: (1) the last successful sync is more than
          // seven days old, or (2) the copy is marked pending but no successful
          // sync was ever recorded, so it has no age to trust. In both cases
          // the whole stored workout is deleted — copy and pending marker, in
          // one transaction, so no dangling pending id remains — and the server
          // document already on screen is rendered instead; the next edit
          // writes a fresh local copy. Discarding a user's pending sets is
          // normally the one forbidden outcome, so these conditions are
          // deliberately narrow and the timestamp check runs only here.
          const lastSyncedAt = await store.lastSyncedAt();
          if (cancelled) return;
          if (isStaleDocument(lastSyncedAt)) {
            await store.deleteWorkout(workoutId);
            void refreshSyncState();
            return;
          }

          workoutRef.current = stored;
          setWorkout(stored);
          void refreshSyncState();
          void runSync();
          return;
        }
        await store.writeWorkout(initialRef.current);
        void refreshSyncState();
      })
      .catch(() => {
        setSyncError(
          "Offline storage is unavailable. Changes on this screen may not survive a reload.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [userId, runSync, refreshSyncState]);

  // Sync when the network returns, and when the tab comes back to the
  // foreground — the two moments a device that was offline is likely to have a
  // connection again. Going offline only re-renders the status: the retry timer
  // deliberately waits for `online`.
  useEffect(() => {
    const syncNow = () => {
      void refreshSyncState();
      void runSync();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    const onOffline = () => {
      // No retry while the browser knows it is offline; the `online` event runs
      // the sync when the connection is back.
      cancelRetry();
      void refreshSyncState();
    };
    window.addEventListener("online", syncNow);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", syncNow);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      cancelRetry();
    };
  }, [cancelRetry, runSync, refreshSyncState]);

  const recordSet = useCallback(
    (setId: string, values: SetFormValues) => {
      const current = workoutRef.current;
      const next: WorkoutTree = {
        ...current,
        exercises: current.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) =>
            set.id === setId
              ? {
                  ...set,
                  reps: values.reps,
                  weight_kg: values.weight_kg,
                  rpe: values.rpe,
                  // Done records and completes the set in one action, as it
                  // always has.
                  completed_at: new Date(),
                }
              : set,
          ),
        })),
      };
      return commit(next);
    },
    [commit],
  );

  const undoSet = useCallback(
    (setId: string) => {
      const current = workoutRef.current;
      void commit({
        ...current,
        exercises: current.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) =>
            set.id === setId ? { ...set, completed_at: null } : set,
          ),
        })),
      });
    },
    [commit],
  );

  const removeSet = useCallback(
    (setId: string) => {
      const current = workoutRef.current;
      void commit({
        ...current,
        exercises: current.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.filter((set) => set.id !== setId),
        })),
      });
    },
    [commit],
  );

  const addSet = useCallback(
    (workoutExerciseId: string) => {
      const current = workoutRef.current;
      const now = new Date();
      void commit({
        ...current,
        exercises: current.exercises.map((exercise) => {
          if (exercise.id !== workoutExerciseId) return exercise;
          const last = exercise.sets.reduce((max, set) => Math.max(max, set.position), -1);
          const set: WorkoutSet = {
            id: crypto.randomUUID(),
            workout_exercise_id: exercise.id,
            // After the current last set, matching the server's append.
            position: last + 1,
            set_type: "normal",
            reps: null,
            weight_kg: null,
            duration_seconds: null,
            distance_meters: null,
            rpe: null,
            metrics: {},
            completed_at: null,
            created_at: now,
            updated_at: now,
          };
          return { ...exercise, sets: [...exercise.sets, set] };
        }),
      });
    },
    [commit],
  );

  const finish = useCallback(() => {
    // Finishing is the end of the session: sync it at once rather than waiting
    // out the debounce.
    void commit({ ...workoutRef.current, ended_at: new Date() }, true);
  }, [commit]);

  const muscleNames = useMemo(
    () => new Map(muscles.map((m) => [m.code, m.display_name])),
    [muscles],
  );

  const active = workout.ended_at == null;
  const stats = summarizeWorkout(workout);
  const exercises = workout.exercises;

  // The rest countdown is anchored to the most recently completed set and the
  // rest target that set's own exercise was started with. Both come from the
  // local document, so completing a set moves the anchor without a round trip.
  let restAnchor: Date | null = null;
  let restSeconds: number | null = null;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed_at && (restAnchor === null || set.completed_at.getTime() > restAnchor.getTime())) {
        restAnchor = set.completed_at;
        restSeconds = ex.rest_seconds;
      }
    }
  }

  // Consecutive exercises sharing a superset key are performed together, so they
  // are rendered as one unit. Keys are only stored when shared (normalised on
  // save), so a keyed group of one cannot occur.
  const groups: { key: string | null; exercises: WorkoutExerciseTree[] }[] = [];
  for (const ex of exercises) {
    const previous = groups.at(-1);
    if (ex.superset_key !== null && previous && previous.key === ex.superset_key) {
      previous.exercises.push(ex);
    } else {
      groups.push({ key: ex.superset_key, exercises: [ex] });
    }
  }

  function renderExercise(ex: WorkoutExerciseTree) {
    return (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 break-words font-medium">{ex.template.title}</span>
          <span className="shrink-0 text-sm text-zinc-500">
            {muscleNames.get(ex.template.primary_muscle) ?? ex.template.primary_muscle}
          </span>
        </div>
        {ex.rest_seconds != null ? (
          <div className="mt-0.5 text-xs text-zinc-400">Rest {ex.rest_seconds}s</div>
        ) : null}
        {ex.notes ? <div className="mt-1 text-sm text-zinc-600">{ex.notes}</div> : null}

        <div className="mt-3 space-y-2">
          {ex.sets.map((s) => {
            const done = s.completed_at != null;
            return (
              <div
                key={s.id}
                className={`rounded-md border p-2 ${
                  done ? "border-green-300 bg-green-50" : "border-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-500">
                    {SET_TYPE_LABELS[s.set_type]}
                  </span>

                  {active ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {done ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            undoSet(s.id);
                          }}
                        >
                          <button
                            type="submit"
                            aria-label="Undo set completion"
                            className="flex h-10 min-w-10 items-center justify-center rounded-md text-base text-zinc-600 hover:bg-zinc-200/60"
                          >
                            ↺
                          </button>
                        </form>
                      ) : null}
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          removeSet(s.id);
                        }}
                      >
                        <button
                          type="submit"
                          aria-label="Remove set"
                          className="flex h-10 min-w-10 items-center justify-center rounded-md text-sm text-red-600 hover:bg-red-50"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>

                <div className="mt-1">
                  {!active || done ? (
                    <span className="text-sm text-zinc-700">
                      <SetValues set={s} />
                      {done ? <span className="ml-1 text-green-600">✓</span> : null}
                    </span>
                  ) : (
                    <SetForm
                      reps={s.reps}
                      weight={s.weight_kg}
                      rpe={s.rpe}
                      onSubmit={(values) => recordSet(s.id, values)}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {active ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addSet(ex.id);
              }}
            >
              <button
                type="submit"
                className="h-10 rounded-md border border-dashed border-zinc-300 px-3 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                + Add set
              </button>
            </form>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-8">
      {/* Sticky so the timer and finish action stay reachable while logging. */}
      <div className="sticky top-0 z-30 -mx-4 border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/workouts"
            aria-label="Back to workouts"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg text-zinc-600 hover:bg-zinc-200/60"
          >
            ←
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-xl">
            {workout.title}
          </h1>
          {active ? (
            <span className="hidden shrink-0 text-sm font-medium tabular-nums text-zinc-700 sm:inline">
              <ElapsedTimer startedAt={workout.started_at.toISOString()} endedAt={null} />
            </span>
          ) : null}
          <RestTimer
            workoutId={workout.id}
            anchor={restAnchor ? restAnchor.toISOString() : null}
            restSeconds={restSeconds}
            workoutActive={active}
          />
          {active ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                finish();
              }}
              className="shrink-0"
            >
              <button
                type="submit"
                className="h-10 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white"
              >
                Finish
              </button>
            </form>
          ) : null}
        </div>
        {/* Quiet sync status, always rendered — the positive state included, so
            "saved" is never merely the absence of the failure banner below. It
            lives in the sticky header, visible while logging and clear of the
            set rows, and stays one truncated line so a sync never shifts the
            layout under a thumb. */}
        <div role="status" className="mt-0.5 truncate text-xs text-zinc-500">
          {SYNC_STATE_TEXT[syncState]}
        </div>
      </div>

      {/* Only rendered when a sync fails; the local change is never discarded. */}
      {syncError ? (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {syncError}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-500">
        <span>{formatDateTimeInTimeZone(workout.started_at, timeZone)}</span>
        {workout.ended_at ? (
          <span>→ {formatDateTimeInTimeZone(workout.ended_at, timeZone)}</span>
        ) : null}
        {!active ? (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Completed · {formatDuration(stats.durationSeconds)}
          </span>
        ) : null}
        {active ? (
          <span className="tabular-nums sm:hidden">
            <ElapsedTimer startedAt={workout.started_at.toISOString()} endedAt={null} />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
        <span>
          {stats.exerciseCount} {stats.exerciseCount === 1 ? "exercise" : "exercises"}
        </span>
        <span>
          {stats.completedSets}/{stats.totalSets} sets
        </span>
        {stats.volumeKg > 0 ? (
          <span>{Math.round(stats.volumeKg).toLocaleString()} kg volume</span>
        ) : null}
      </div>

      <ol className="mt-6 space-y-4">
        {groups.map((group) => {
          const isSuperset = group.key !== null && group.exercises.length > 1;

          if (!isSuperset) {
            return (
              <li key={group.exercises[0].id} className={EXERCISE_CARD}>
                {renderExercise(group.exercises[0])}
              </li>
            );
          }

          return (
            <li
              key={group.exercises[0].id}
              className="rounded-xl border border-sky-200 bg-sky-50/60 p-2 sm:p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-2">
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
                  Superset
                </span>
                <span className="text-xs text-sky-800">
                  Alternate between these, then rest
                </span>
              </div>
              <div className="space-y-3">
                {group.exercises.map((ex) => (
                  <div key={ex.id} className={EXERCISE_CARD}>
                    {renderExercise(ex)}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
