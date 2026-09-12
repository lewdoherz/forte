"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ExerciseType, SetType, WorkoutSet } from "@/schema/types";
import {
  cacheCurrentOfflineRoute,
  openOfflineStore,
  type OfflineStore,
} from "@/lib/offline-store";
import { formatSetValues, formatVolumeKg, summarizeWorkout } from "@/lib/workout-stats";
import type { LoggedExercise, LoggedWorkout, WorkoutSyncInput } from "@/lib/workout-sync";
import {
  discardWorkoutAction,
  previousPerformanceAction,
  syncWorkoutStateAction,
  type SyncFailureCode,
} from "@/lib/workout-actions";
import type { PreviousPerformance } from "@/lib/previous-performance";
import { ElapsedTimer } from "@/components/elapsed-timer";
import { RestTimer } from "@/components/rest-timer";
import { SetForm, type SetFormValues } from "@/components/set-form";
import { ExercisePicker, type PickerExercise } from "@/components/exercise-picker";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { Modal } from "@/components/modal";
import { formatDuration } from "@/lib/format";
import { formatDateTimeInTimeZone } from "@/lib/timezone";

/**
 * A catalog row for the logger's picker. Wider than `PickerExercise` because an
 * exercise added mid-workout also has to render its own set fields, which the
 * exercise type chooses.
 */
export interface LoggerLibraryExercise extends PickerExercise {
  exercise_type: ExerciseType;
}

/** Which destructive action, if any, the screen is confirming. */
type ConfirmState =
  | { kind: "finish" }
  | { kind: "discard" }
  | { kind: "removeExercise"; exerciseId: string; title: string; setCount: number };

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

/**
 * One previous set's values for the PREVIOUS column, or an em dash when there
 * is no prior set at this index. Formatted through `formatSetValues`, so a
 * previous set reads in the same units and with the same type-specific fields
 * as every other set in the app.
 */
function previousText(
  performance: PreviousPerformance | undefined,
  index: number,
  exerciseType: ExerciseType,
): string {
  const set = performance?.sets[index];
  return set ? formatSetValues(set, exerciseType) : "—";
}

/** A blank set, shaped exactly as the server's own append produces one. */
function blankSet(workoutExerciseId: string, position: number, now: Date): WorkoutSet {
  return {
    id: crypto.randomUUID(),
    workout_exercise_id: workoutExerciseId,
    position,
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
}

export function WorkoutLogger({
  initial,
  userId,
  timeZone,
  muscles,
  equipment,
  library,
  previous,
}: {
  initial: LoggedWorkout;
  userId: string;
  timeZone: string;
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
  /** The visible catalog the picker searches; also resolves an added exercise. */
  library: LoggerLibraryExercise[];
  /** Last completed performance per exercise template id; absent means none. */
  previous: Record<string, PreviousPerformance>;
}) {
  const router = useRouter();
  // The server render is the first paint and a new object every request, so its
  // identity is pinned for the one mount that matters.
  const initialRef = useRef(initial);
  const [workout, setWorkout] = useState(initial);
  // The in-memory document is the source of truth for rendering and for every
  // sync; the store is its durable copy. A ref mirrors it so event handlers and
  // the sync loop read the latest value without waiting for a re-render.
  const workoutRef = useRef(initial);

  // Last-time values live in state because an exercise added mid-workout brings
  // its own history back from the server after the row is already on screen.
  const [previousById, setPreviousById] = useState(previous);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

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
          // The complete exercise list, so adding or removing one mid-workout is
          // reconciled by the same document as the sets.
          exercises: doc.exercises.map((exercise) => ({
            id: exercise.id,
            template_id: exercise.template_id,
            position: exercise.position,
            superset_key: exercise.superset_key,
            rest_seconds: exercise.rest_seconds,
            notes: exercise.notes,
          })),
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
  const persist = useCallback(async (doc: LoggedWorkout): Promise<void> => {
    const store = storeRef.current ?? (storePromiseRef.current ? await storePromiseRef.current : null);
    if (!store) return;
    await store.markPending(doc.id);
    await store.writeWorkout(doc);
    void refreshSyncState();
  }, [refreshSyncState]);

  /**
   * Local-first mutation: the document changes in memory and on disk at once,
   * and the sync follows. Returns the local write so the set form can show its
   * pending affordance until the change is durable; an immediate mutation
   * returns the sync instead, which is what finishing awaits before handing over
   * to the completed view.
   */
  const commit = useCallback(
    (next: LoggedWorkout, immediate = false): Promise<void> => {
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
      if (immediate) return persisted.then(() => runSync());
      void persisted.then(() => scheduleSync());
      return persisted;
    },
    [persist, runSync, scheduleSync],
  );

  // Hydrate the store once, then render from it. The first paint above already
  // came from `initial`, so there is no flash of empty content.
  useEffect(() => {
    const onControllerChange = () => {
      // Registration happens after window.load. If this logger opened before
      // the first worker took control, warm its snapshot as soon as it does.
      if (storeRef.current) cacheCurrentOfflineRoute();
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    }
    let cancelled = false;
    const opening = openOfflineStore(userId);
    storePromiseRef.current = opening;
    opening
      .then(async (store) => {
        if (cancelled) return;
        storeRef.current = store;
        // A client-side transition has no navigation response for the worker to
        // retain. Snapshot this exact logger route after ownership is claimed.
        cacheCurrentOfflineRoute();
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
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
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
      const next: LoggedWorkout = {
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
          // After the current last set, matching the server's append.
          return { ...exercise, sets: [...exercise.sets, blankSet(exercise.id, last + 1, now)] };
        }),
      });
    },
    [commit],
  );

  const libraryById = useMemo(() => {
    const byId: Record<string, LoggerLibraryExercise> = {};
    for (const entry of library) byId[entry.id] = entry;
    return byId;
  }, [library]);

  /**
   * Appends an exercise built from the catalog row the picker selected. The row
   * appears immediately with one blank set; last time's values are fetched
   * afterwards, because the picker knew the exercise existed but not its
   * history, and blocking the add on that lookup would make the button feel
   * broken. Order is preserved by appending: nothing already in the workout
   * moves.
   */
  const addExercise = useCallback(
    (templateId: string) => {
      setPickerOpen(false);
      const entry = libraryById[templateId];
      const current = workoutRef.current;
      if (!entry || current.exercises.some((exercise) => exercise.template_id === templateId)) {
        return;
      }

      const now = new Date();
      const exerciseId = crypto.randomUUID();
      const exercise: LoggedExercise = {
        id: exerciseId,
        workout_id: current.id,
        template_id: templateId,
        position: current.exercises.length,
        superset_key: null,
        rest_seconds: null,
        notes: null,
        created_at: now,
        updated_at: now,
        template: {
          id: entry.id,
          slug: entry.slug,
          title: entry.title,
          exercise_type: entry.exercise_type,
          primary_muscle: entry.primary_muscle,
        },
        sets: [blankSet(exerciseId, 0, now)],
      };
      void commit({ ...current, exercises: [...current.exercises, exercise] });

      void previousPerformanceAction(templateId)
        .then((performance) => {
          if (!performance) return;
          // Nothing overwrites a value that was already resolved from the page.
          setPreviousById((prev) =>
            prev[templateId] ? prev : { ...prev, [templateId]: performance },
          );
        })
        .catch(() => {
          // Offline or the lookup failed: the column shows its empty state.
        });
    },
    [commit, libraryById],
  );

  /** Removes an exercise and its sets, renumbering so positions stay dense. */
  const removeExercise = useCallback(
    (exerciseId: string) => {
      const current = workoutRef.current;
      void commit({
        ...current,
        exercises: current.exercises
          .filter((exercise) => exercise.id !== exerciseId)
          .map((exercise, position) => ({ ...exercise, position })),
      });
      setConfirm(null);
    },
    [commit],
  );

  const finishNow = useCallback(async () => {
    setConfirm(null);
    setFinishing(true);
    // Finishing is the end of the session: sync it at once rather than waiting
    // out the debounce, and only then hand over to the completed view. The
    // server render decides which view that is from `ended_at`.
    await commit({ ...workoutRef.current, ended_at: new Date() }, true);
    setFinishing(false);
    router.refresh();
  }, [commit, router]);

  /**
   * Finishing never completes a set for the user. If any set is still open, the
   * count is confirmed first; the open sets are then saved as they are — not
   * completed, and not deleted — so an empty placeholder never becomes a
   * recorded, "valid" set.
   */
  const requestFinish = useCallback(() => {
    const incomplete = workoutRef.current.exercises.reduce(
      (count, exercise) => count + exercise.sets.filter((set) => set.completed_at == null).length,
      0,
    );
    if (incomplete === 0) {
      void finishNow();
      return;
    }
    setConfirm({ kind: "finish" });
  }, [finishNow]);

  /**
   * Discards the workout outright. The server is asked first: clearing the local
   * copy of a workout the server still has would only make it reappear. On
   * success the local document and its pending marker go, so a deleted workout
   * is never re-synced.
   */
  const discard = useCallback(async () => {
    setDiscarding(true);
    setDiscardError(null);
    let result: { ok: true } | { error: string };
    try {
      result = await discardWorkoutAction(workoutRef.current.id);
    } catch {
      result = { error: UNREACHABLE_MESSAGE };
    }
    if ("error" in result) {
      setDiscardError(result.error);
      setDiscarding(false);
      return;
    }

    cancelRetry();
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const store =
      storeRef.current ?? (storePromiseRef.current ? await storePromiseRef.current : null);
    if (store) {
      await store.deleteWorkout(workoutRef.current.id).catch(() => {
        // The workout is gone on the server; a failed local delete leaves at
        // most a stale document that no longer has an id to sync to.
      });
    }
    router.push("/workouts");
  }, [cancelRetry, router]);

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
  const groups: { key: string | null; exercises: LoggedExercise[] }[] = [];
  for (const ex of exercises) {
    const previous = groups.at(-1);
    if (ex.superset_key !== null && previous && previous.key === ex.superset_key) {
      previous.exercises.push(ex);
    } else {
      groups.push({ key: ex.superset_key, exercises: [ex] });
    }
  }

  function renderExercise(ex: LoggedExercise) {
    const exerciseType = ex.template.exercise_type;
    const performance = previousById[ex.template_id];
    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 break-words font-medium">{ex.template.title}</span>
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-sm text-zinc-500">
              {muscleNames.get(ex.template.primary_muscle) ?? ex.template.primary_muscle}
            </span>
            {active ? (
              <button
                type="button"
                aria-label={`Remove ${ex.template.title}`}
                onClick={() =>
                  setConfirm({
                    kind: "removeExercise",
                    exerciseId: ex.id,
                    title: ex.template.title,
                    setCount: ex.sets.length,
                  })
                }
                className="flex h-9 min-w-9 items-center justify-center rounded-md text-sm text-red-600 hover:bg-red-50"
              >
                ✕
              </button>
            ) : null}
          </span>
        </div>
        {ex.rest_seconds != null ? (
          <div className="mt-0.5 text-xs text-zinc-400">Rest {ex.rest_seconds}s</div>
        ) : null}
        {ex.notes ? <div className="mt-1 text-sm text-zinc-600">{ex.notes}</div> : null}

        <div className="mt-3 space-y-2">
          {ex.sets.map((s, index) => {
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

                {/* Current values on the left, last time's on the right from
                    `sm` up; below that the previous value sits under the set it
                    answers rather than in a squeezed column. */}
                <div className="mt-1 grid gap-1.5 sm:grid-cols-[1fr_9rem] sm:items-baseline sm:gap-3">
                  <div className="min-w-0">
                    {!active || done ? (
                      <span className="text-sm text-zinc-700">
                        {formatSetValues(s, exerciseType)}
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
                  <div className="flex items-baseline gap-1.5 text-xs sm:justify-end">
                    <span className="uppercase tracking-wide text-zinc-400">Previous</span>
                    <span className="min-w-0 truncate tabular-nums text-zinc-600">
                      {previousText(performance, index, exerciseType)}
                    </span>
                  </div>
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

  // Open sets are what finishing must confirm. Derived from the document rather
  // than a flag, so it stays correct as sets are completed or removed.
  const incompleteSets = exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.completed_at == null).length,
    0,
  );
  // Exercises already in the workout; the picker hides them so one cannot be
  // added twice.
  const addedTemplateIds = new Set(exercises.map((exercise) => exercise.template_id));

  return (
    <main className="mx-auto max-w-2xl px-4 pb-8">
      {/* Sticky so the metrics, timer and finish action stay reachable while
          logging. */}
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
          <RestTimer
            workoutId={workout.id}
            anchor={restAnchor ? restAnchor.toISOString() : null}
            restSeconds={restSeconds}
            workoutActive={active}
          />
          {active ? (
            <button
              type="button"
              onClick={requestFinish}
              disabled={finishing}
              className="h-10 shrink-0 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {finishing ? "Finishing…" : "Finish"}
            </button>
          ) : null}
        </div>

        {/* Live session metrics, derived from the document and the start time —
            the same volume `summarizeWorkout` computes elsewhere, never a
            second formula. Duration ticks from `started_at` on its own. */}
        <dl className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-zinc-400">Duration</dt>
            <dd className="font-medium tabular-nums text-zinc-700">
              {active ? (
                <ElapsedTimer startedAt={workout.started_at.toISOString()} endedAt={null} />
              ) : (
                formatDuration(stats.durationSeconds)
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-zinc-400">Volume</dt>
            <dd className="font-medium tabular-nums text-zinc-700">
              {formatVolumeKg(stats.volumeKg)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-zinc-400">Sets</dt>
            <dd className="font-medium tabular-nums text-zinc-700">
              {stats.completedSets}/{stats.totalSets}
            </dd>
          </div>
        </dl>

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
        <span>
          {stats.exerciseCount} {stats.exerciseCount === 1 ? "exercise" : "exercises"}
        </span>
        {!active ? (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Completed · {formatDuration(stats.durationSeconds)}
          </span>
        ) : null}
      </div>

      {active ? (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50"
          >
            Add exercise
          </button>
          <button
            type="button"
            onClick={() => {
              setDiscardError(null);
              setConfirm({ kind: "discard" });
            }}
            className="ml-auto h-11 rounded-md px-3 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Discard
          </button>
        </div>
      ) : null}

      {exercises.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
          {active
            ? "No exercises yet. Add one to start logging sets."
            : "No exercises were performed in this workout."}
        </p>
      ) : (
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
      )}

      {pickerOpen ? (
        <Modal title="Add exercise" onClose={() => setPickerOpen(false)} panelClassName="max-w-lg">
          <div className="mt-3">
            <ExercisePicker
              exercises={library}
              muscles={muscles}
              equipment={equipment}
              excludeIds={addedTemplateIds}
              onSelect={addExercise}
            />
          </div>
        </Modal>
      ) : null}

      {confirm ? (
        <Modal
          title={
            confirm.kind === "finish"
              ? "Finish workout"
              : confirm.kind === "discard"
                ? "Discard workout"
                : "Remove exercise"
          }
          onClose={() => {
            // A destructive request in flight must not be dismissed underneath
            // its own confirmation.
            if (!discarding && !finishing) setConfirm(null);
          }}
          panelClassName="max-w-md"
        >
          {confirm.kind === "finish" ? (
            <>
              <p className="mt-3 text-sm text-zinc-600">
                {incompleteSets} of {stats.totalSets} {stats.totalSets === 1 ? "set is" : "sets are"}{" "}
                not completed. {incompleteSets === 1 ? "It" : "They"} will be saved as not
                completed — nothing is marked done for you.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50"
                >
                  Keep logging
                </button>
                <button
                  type="button"
                  onClick={() => void finishNow()}
                  disabled={finishing}
                  className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {finishing ? "Finishing…" : "Finish workout"}
                </button>
              </div>
            </>
          ) : null}

          {confirm.kind === "discard" ? (
            <>
              <p className="mt-3 text-sm text-zinc-600">
                This deletes the workout without saving a completed one. This cannot be undone.
              </p>
              {discardError ? (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {discardError}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  disabled={discarding}
                  className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void discard()}
                  disabled={discarding}
                  className="h-11 rounded-md bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {discarding ? "Discarding…" : "Discard workout"}
                </button>
              </div>
            </>
          ) : null}

          {confirm.kind === "removeExercise" ? (
            <>
              <p className="mt-3 text-sm text-zinc-600">
                Remove {confirm.title}?{" "}
                {confirm.setCount === 1
                  ? "Its 1 set will be removed too."
                  : `Its ${confirm.setCount} sets will be removed too.`}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => removeExercise(confirm.exerciseId)}
                  className="h-11 rounded-md bg-red-600 px-4 text-sm font-medium text-white"
                >
                  Remove
                </button>
              </div>
            </>
          ) : null}
        </Modal>
      ) : null}
    </main>
  );
}
