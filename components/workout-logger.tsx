"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DurationRecordDirection, ExerciseType, SetType, WorkoutSet } from "@/schema/types";
import {
  cacheCurrentOfflineRoute,
  LOCAL_GUEST_OWNER,
  openOfflineStore,
  type OfflineStore,
} from "@/lib/offline-store";
import { workoutToSyncPayload } from "@/lib/offline-sync";
import {
  DEFAULT_REST_PREFS,
  readRestPreferences,
  REST_PREFS_EVENT,
  triggerRestCompletionAlert,
  writeRestPreferences,
  type RestPreferences,
} from "@/lib/rest-prefs";
import { formatSetValues, formatVolumeKg, summarizeWorkout } from "@/lib/workout-stats";
import { getSetSuggestion, readForteTimer, timerElapsed } from "@/lib/set-suggestions";
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
import { SetForm, SetGridHeader, type SetFormValues } from "@/components/set-form";
import type { PickerExercise } from "@/components/exercise-picker";
import { WorkoutExercisePicker } from "@/components/workout-exercise-picker";
import { ExerciseThumbnail } from "@/components/exercise-media";
import type { VocabularyEntry } from "@/components/exercise-filter-form";
import { Modal } from "@/components/modal";
import { formatDuration } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/context";
import type { Locale, MessageKey } from "@/lib/i18n";
import { formatDateTimeInTimeZone } from "@/lib/timezone";

export interface LoggerLibraryExercise extends PickerExercise {
  exercise_type: ExerciseType;
  equipment: string;
  secondary_muscles: string[];
  how_to?: string | null;
  media_url?: string | null;
  duration_record_direction?: DurationRecordDirection;
  is_custom?: boolean;
}

type ConfirmState =
  | { kind: "finish" }
  | { kind: "discard" }
  | { kind: "removeExercise"; exerciseId: string; title: string; setCount: number };

const EXERCISE_CARD = "training-panel overflow-hidden rounded-2xl p-3 sm:p-5";
const SYNC_DEBOUNCE_MS = 800;
const RETRY_BASE_MS = 2_000;
const RETRY_CEILING_MS = 60_000;

type SyncState = "saved" | "pending" | "offline" | "auth_required";

const SYNC_STATE_KEYS: Record<SyncState, MessageKey> = {
  saved: "logger.sync.saved",
  pending: "logger.sync.pending",
  offline: "logger.sync.offline",
  auth_required: "logger.sync.authRequired",
};

function previousText(
  performance: PreviousPerformance | undefined,
  index: number,
  exerciseType: ExerciseType,
  locale: Locale,
): string {
  const set = performance?.sets[index];
  return set ? formatSetValues(set, exerciseType, locale) : "—";
}

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
  recentExerciseIds = [],
  workouts = [],
  offlineShellMode = false,
  onMinimize,
  onFinishedLocally,
  onDiscardedLocally,
}: {
  initial: LoggedWorkout;
  userId: string;
  timeZone: string;
  muscles: VocabularyEntry[];
  equipment: VocabularyEntry[];
  library: LoggerLibraryExercise[];
  previous: Record<string, PreviousPerformance>;
  recentExerciseIds?: string[];
  workouts?: LoggedWorkout[];
  /** True when mounted inside `/offline-app` (uses `/api/offline/sync` and local navigation). */
  offlineShellMode?: boolean;
  onMinimize?: () => void;
  onFinishedLocally?: (workout: LoggedWorkout, synced: boolean) => void;
  onDiscardedLocally?: (workoutId: string) => void;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const initialRef = useRef(initial);
  const [workout, setWorkout] = useState(initial);
  const workoutRef = useRef(initial);

  const [previousById, setPreviousById] = useState(previous);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const finishGuard = useRef(false);
  const acknowledgedRevision = useRef(-1);
  const [ready, setReady] = useState(false);
  const [restPrefs, setRestPrefs] = useState<RestPreferences>(DEFAULT_REST_PREFS);
  const [restEditing, setRestEditing] = useState<string | null>(null);

  const storeRef = useRef<OfflineStore | null>(null);
  const storePromiseRef = useRef<Promise<OfflineStore> | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const debounceRef = useRef<number | null>(null);
  const syncingRef = useRef<Promise<boolean> | null>(null);
  const rerunRef = useRef(false);
  const revisionRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(RETRY_BASE_MS);
  const rejectedRevisionRef = useRef<number | null>(null);
  const runSyncRef = useRef<() => void>(() => {});

  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("saved");

  const refreshSyncState = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    if (userId === LOCAL_GUEST_OWNER) {
      setSyncState("offline");
      return;
    }
    let pending: boolean;
    try {
      pending = (await store.pendingWorkoutIds()).includes(workoutRef.current.id);
    } catch {
      return;
    }
    if (!pending) {
      setSyncState("saved");
      return;
    }
    setSyncState((prev) => (prev === "auth_required" ? "auth_required" : navigator.onLine ? "pending" : "offline"));
  }, [userId]);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

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

  const runSync = useCallback(async (): Promise<boolean> => {
    if (userId === LOCAL_GUEST_OWNER) return false;
    if (syncingRef.current) {
      rerunRef.current = true;
      return syncingRef.current;
    }
    const operation = (async (): Promise<boolean> => {
      for (;;) {
        rerunRef.current = false;
        const revision = revisionRef.current;
        const store = storeRef.current;
        if (rejectedRevisionRef.current === revision) return false;
        const doc = workoutRef.current;

        let result: { ok: true } | { error: string; code: SyncFailureCode | "unauthorized" };

        if (offlineShellMode) {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            setSyncState("offline");
            return false;
          }
          try {
            const payload = workoutToSyncPayload(doc);
            const res = await fetch("/api/offline/sync", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ routines: [], workouts: [payload] }),
            });
            if (res.status === 401) {
              result = { error: t("offline.badge.authRequired"), code: "unauthorized" };
            } else if (!res.ok) {
              result = { error: t("logger.sync.unreachable"), code: "transient" };
            } else {
              const json = (await res.json()) as {
                workouts?: Array<{ id: string; ok: boolean; code?: SyncFailureCode; error?: string }>;
              };
              const item = json.workouts?.[0];
              if (item && !item.ok) {
                result = {
                  error: item.error ?? t("workouts.error.syncFailed"),
                  code: item.code ?? "transient",
                };
              } else {
                result = { ok: true };
              }
            }
          } catch {
            setSyncError(t("logger.sync.unreachable"));
            scheduleRetry();
            void refreshSyncState();
            return false;
          }
        } else {
          const input: WorkoutSyncInput = {
            workoutId: doc.id,
            endedAt: doc.ended_at ? new Date(doc.ended_at).toISOString() : null,
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
                duration_seconds: set.duration_seconds,
                distance_meters: set.distance_meters,
                rpe: set.rpe,
                metrics: set.metrics,
                completed_at: set.completed_at ? new Date(set.completed_at).toISOString() : null,
              })),
            ),
          };
          try {
            result = await syncWorkoutStateAction(input);
          } catch {
            setSyncError(t("logger.sync.unreachable"));
            scheduleRetry();
            void refreshSyncState();
            return false;
          }
        }

        if ("error" in result) {
          if (result.code === "unauthorized") {
            cancelRetry();
            setSyncState("auth_required");
            setSyncError(result.error);
          } else if (result.code === "permanent") {
            rejectedRevisionRef.current = revision;
            cancelRetry();
            setSyncError(t("logger.sync.permanentSuffix", { message: result.error }));
          } else {
            setSyncError(t("logger.sync.keptSuffix", { message: result.error }));
            scheduleRetry();
          }
          void refreshSyncState();
          return false;
        }

        if (revision === revisionRef.current) {
          acknowledgedRevision.current = revision;
          if (store) {
            await store.clearPending(doc.id).catch(() => {});
            await store.setLastSyncedAt(new Date().toISOString()).catch(() => {});
          }
          retryDelayRef.current = RETRY_BASE_MS;
          cancelRetry();
          setSyncError(null);
          setSyncState("saved");
        }
        if (!rerunRef.current && revision === revisionRef.current) return true;
      }
    })();
    syncingRef.current = operation;
    try {
      return await operation;
    } finally {
      if (syncingRef.current === operation) syncingRef.current = null;
    }
  }, [cancelRetry, offlineShellMode, refreshSyncState, scheduleRetry, t, userId]);

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

  const persist = useCallback(
    (doc: LoggedWorkout): Promise<void> => {
      const next = persistQueueRef.current.then(async () => {
        const store = storeRef.current ?? (storePromiseRef.current ? await storePromiseRef.current : null);
        if (!store) return;
        const latest = workoutRef.current.id === doc.id ? workoutRef.current : doc;
        await store.markPending(latest.id);
        await store.writeWorkout(latest);
        void refreshSyncState();
      });
      persistQueueRef.current = next.catch(() => {});
      return next;
    },
    [refreshSyncState],
  );

  const commit = useCallback(
    (next: LoggedWorkout): Promise<void> => {
      revisionRef.current += 1;
      workoutRef.current = next;
      setWorkout(next);
      setSyncState(userId === LOCAL_GUEST_OWNER || !navigator.onLine ? "offline" : "pending");
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      const persisted = persist(next).catch(() => {
        setSyncError(t("logger.sync.storageUnavailable"));
      });
      void persisted.then(() => scheduleSync());
      return persisted;
    },
    [persist, scheduleSync, t, userId],
  );

  useEffect(() => {
    const syncPrefs = () => setRestPrefs(readRestPreferences(userId));
    const task = window.setTimeout(syncPrefs, 0);
    window.addEventListener(REST_PREFS_EVENT, syncPrefs);
    return () => {
      window.clearTimeout(task);
      window.removeEventListener(REST_PREFS_EVENT, syncPrefs);
    };
  }, [userId]);

  useEffect(() => {
    const onControllerChange = () => {
      if (storeRef.current && !offlineShellMode) cacheCurrentOfflineRoute();
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
        if (!offlineShellMode) cacheCurrentOfflineRoute();
        const workoutId = initialRef.current.id;
        const stored = await store.readWorkout(workoutId);
        const pending = stored ? await store.pendingWorkoutIds() : [];
        if (cancelled || revisionRef.current > 0) return;

        if (stored && pending.includes(workoutId)) {
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
        setSyncError(t("logger.sync.storageUnavailable"));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
    };
  }, [userId, offlineShellMode, runSync, refreshSyncState, t]);

  useEffect(() => {
    const syncNow = () => {
      void refreshSyncState();
      void runSync();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    const onOffline = () => {
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

  const updateSet = useCallback(
    (setId: string, values: Partial<SetFormValues> & { set_type?: SetType }, toggle = false) => {
      const current = workoutRef.current;
      if (current.ended_at !== null) return Promise.resolve();
      return commit({
        ...current,
        exercises: current.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) =>
            set.id === setId
              ? {
                  ...set,
                  ...values,
                  completed_at: toggle ? (set.completed_at ? null : new Date()) : set.completed_at,
                }
              : set,
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

  const addExercises = useCallback(
    (templateIds: string[]) => {
      setPickerOpen(false);
      const current = workoutRef.current;
      const now = new Date();
      const existing = new Set(current.exercises.map((exercise) => exercise.template_id));
      const added: LoggedExercise[] = [];
      for (const templateId of templateIds) {
        const entry = libraryById[templateId];
        if (!entry || existing.has(templateId)) continue;
        existing.add(templateId);
        const id = crypto.randomUUID();
        added.push({
          id,
          workout_id: current.id,
          template_id: templateId,
          position: current.exercises.length + added.length,
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
          sets: [blankSet(id, 0, now)],
        });
        if (!offlineShellMode && navigator.onLine) {
          void previousPerformanceAction(templateId)
            .then((performance) => {
              if (performance) {
                setPreviousById((prev) => (prev[templateId] ? prev : { ...prev, [templateId]: performance }));
              }
            })
            .catch(() => {});
        }
      }
      if (added.length) void commit({ ...current, exercises: [...current.exercises, ...added] });
    },
    [commit, libraryById, offlineShellMode],
  );

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
    if (finishGuard.current) return;
    finishGuard.current = true;
    setFinishing(true);
    try {
      const current = workoutRef.current;
      const endedAt = current.ended_at ?? new Date();
      let finishedDoc = current;
      if (!current.ended_at) {
        finishedDoc = {
          ...current,
          ended_at: endedAt,
          exercises: current.exercises.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.map((set) => {
              const timer = readForteTimer(set.metrics);
              if (!timer?.startedAt) return set;
              const seconds = timerElapsed(timer, endedAt.getTime());
              return {
                ...set,
                duration_seconds: seconds,
                metrics: { ...set.metrics, forte_timer: { startedAt: null, elapsedSeconds: seconds } },
              };
            }),
          })),
        };
        await commit(finishedDoc);
      }
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const synced = await runSync();
      if (offlineShellMode && onFinishedLocally) {
        setConfirm(null);
        onFinishedLocally(finishedDoc, synced);
        return;
      }
      if (synced) {
        router.refresh();
      }
    } finally {
      finishGuard.current = false;
      setFinishing(false);
    }
  }, [commit, offlineShellMode, onFinishedLocally, router, runSync]);

  const requestFinish = useCallback(() => setConfirm({ kind: "finish" }), []);

  const discard = useCallback(async () => {
    setDiscarding(true);
    setDiscardError(null);
    if (!offlineShellMode && userId !== LOCAL_GUEST_OWNER) {
      let result: { ok: true } | { error: string };
      try {
        result = await discardWorkoutAction(workoutRef.current.id);
      } catch {
        result = { error: t("logger.sync.unreachable") };
      }
      if ("error" in result) {
        setDiscardError(result.error);
        setDiscarding(false);
        return;
      }
    }

    cancelRetry();
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const store = storeRef.current ?? (storePromiseRef.current ? await storePromiseRef.current : null);
    if (store) {
      await store.deleteWorkout(workoutRef.current.id).catch(() => {});
    }
    if (offlineShellMode && onDiscardedLocally) {
      onDiscardedLocally(workoutRef.current.id);
      return;
    }
    router.push("/workouts");
  }, [cancelRetry, offlineShellMode, onDiscardedLocally, router, t, userId]);

  const muscleNames = useMemo(
    () => new Map(muscles.map((m) => [m.code, m.display_name])),
    [muscles],
  );

  const active = workout.ended_at == null;
  const stats = summarizeWorkout(workout);
  const exercises = workout.exercises;
  useEffect(() => {
    if (!offlineShellMode && workout.ended_at && syncState === "saved" && acknowledgedRevision.current === revisionRef.current) {
      router.refresh();
    }
  }, [offlineShellMode, workout.ended_at, syncState, router]);

  let restAnchor: Date | null = null;
  let restSeconds: number | null = null;
  let restAnchorId: string | null = null;
  const completedIds: string[] = [];
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed_at) completedIds.push(set.id);
      if (
        set.completed_at &&
        (restAnchor === null || new Date(set.completed_at).getTime() > restAnchor.getTime())
      ) {
        restAnchor = new Date(set.completed_at);
        restSeconds = ex.rest_seconds ?? restPrefs.defaultRestSeconds;
        restAnchorId = set.id;
      }
    }
  }

  const groups: { key: string | null; exercises: LoggedExercise[] }[] = [];
  for (const ex of exercises) {
    const previous = groups.at(-1);
    if (ex.superset_key !== null && previous && previous.key === ex.superset_key) {
      previous.exercises.push(ex);
    } else {
      groups.push({ key: ex.superset_key, exercises: [ex] });
    }
  }

  function changeExercise(id: string, patch: Partial<Pick<LoggedExercise, "rest_seconds" | "notes">>) {
    const current = workoutRef.current;
    void commit({
      ...current,
      exercises: current.exercises.map((exercise) => (exercise.id === id ? { ...exercise, ...patch } : exercise)),
    });
  }

  function updateDeviceRestPrefs(patch: Partial<RestPreferences>) {
    const next = writeRestPreferences(userId, patch);
    setRestPrefs(next);
  }

  function renderExercise(ex: LoggedExercise) {
    const exerciseType = ex.template.exercise_type;
    const performance = previousById[ex.template_id];
    const rest = ex.rest_seconds ?? restPrefs.defaultRestSeconds;
    return (
      <>
        <div className="flex items-start gap-3">
          <ExerciseThumbnail slug={ex.template.slug} />
          <div className="min-w-0 flex-1">
            <h2>
              {offlineShellMode ? (
                <span className="block min-h-11 break-words py-1 text-base font-semibold leading-snug">
                  {ex.template.title}
                </span>
              ) : (
                <Link
                  href={`/exercises/${ex.template_id}?tab=history`}
                  className="block min-h-11 break-words py-1 text-base font-semibold leading-snug text-[var(--text-primary)] hover:text-[var(--accent-text)]"
                >
                  {ex.template.title}
                </Link>
              )}
            </h2>
            <p className="training-muted text-xs">{muscleNames.get(ex.template.primary_muscle) ?? ex.template.primary_muscle}</p>
          </div>
          <button
            type="button"
            disabled={!active || !ready}
            aria-label={t("logger.exercise.removeLabel", { title: ex.template.title })}
            onClick={() => setConfirm({ kind: "removeExercise", exerciseId: ex.id, title: ex.template.title, setCount: ex.sets.length })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40"
          >
            ✕
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <button
            type="button"
            disabled={!active || !ready}
            onClick={() => setRestEditing(ex.id)}
            className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]"
          >
            {t("logger.rest.setting", { value: rest === 0 ? t("logger.rest.off") : formatDuration(locale, rest) })}
          </button>
          <details className="min-w-0 flex-1">
            <summary className="training-muted flex min-h-11 cursor-pointer items-center px-2 text-sm">
              {t("logger.exercise.notes")}
              {ex.notes ? " •" : ""}
            </summary>
            <textarea
              aria-label={t("logger.exercise.notes")}
              maxLength={2000}
              value={ex.notes ?? ""}
              disabled={!active || !ready}
              onChange={(event) => changeExercise(ex.id, { notes: event.target.value || null })}
              className="training-input mt-1 min-h-20 w-full rounded-xl p-3 text-base"
            />
          </details>
        </div>
        {ex.notes ? <p className="training-muted mt-2 whitespace-pre-wrap break-words text-sm">{ex.notes}</p> : null}
        <SetGridHeader exerciseType={exerciseType} />
        <div className="space-y-1.5">
          {ex.sets.map((set, index) => (
            <SetForm
              key={set.id}
              set={set}
              index={index}
              exerciseType={exerciseType}
              suggestion={getSetSuggestion(ex, set, index, performance)}
              previous={previousText(performance, index, exerciseType, locale)}
              disabled={!active || !ready || finishing}
              onUpdate={(patch) => updateSet(set.id, patch)}
              onToggle={(values) => updateSet(set.id, values, true)}
              onRemove={() => removeSet(set.id)}
            />
          ))}
        </div>
        {active ? (
          <button
            type="button"
            disabled={!ready}
            onClick={() => addSet(ex.id)}
            className="mt-3 min-h-11 w-full rounded-xl border border-dashed border-[var(--border-strong)] px-3 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40"
          >
            + {t("logger.set.add")}
          </button>
        ) : null}
      </>
    );
  }

  const incompleteSets = exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.completed_at == null).length,
    0,
  );
  const addedTemplateIds = new Set(exercises.map((exercise) => exercise.template_id));

  const hasVolume = exercises.some((exercise) =>
    ["weight_reps", "bodyweight_weighted"].includes(exercise.template.exercise_type),
  );
  const editingExercise = exercises.find((exercise) => exercise.id === restEditing);
  const restValue = restEditing === "default" ? restPrefs.defaultRestSeconds : editingExercise?.rest_seconds ?? "default";
  const restOptions = [0, 30, 45, 60, 90, 120, 180, 300];
  if (typeof restValue === "number" && !restOptions.includes(restValue)) restOptions.push(restValue);

  return (
    <main data-active-logger className="training training-logger mx-auto min-h-dvh max-w-3xl px-3 pb-[calc(9rem+var(--app-safe-bottom))] sm:px-6">
      <header className="sticky top-[var(--app-safe-top)] z-30 -mx-3 border-b border-[var(--border-subtle)] bg-[var(--nav-backdrop)] px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          {onMinimize ? (
            <button
              type="button"
              onClick={onMinimize}
              aria-label={t("logger.minimize")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          ) : (
            <Link
              href="/workout"
              aria-label={t("logger.minimize")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <p className="training-muted text-[10px] font-semibold uppercase tracking-[0.18em]">{t("logger.session")}</p>
            <h1 className="truncate text-base font-semibold sm:text-xl">{workout.title}</h1>
          </div>
          <button
            type="button"
            onClick={requestFinish}
            disabled={!ready || finishing}
            className="training-action min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
          >
            {finishing ? t("logger.finish.finishing") : t("logger.finish.action")}
          </button>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-3 px-1">
          <div>
            <dt className="training-muted text-xs">{t("logger.metric.duration")}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {active ? (
                <ElapsedTimer startedAt={new Date(workout.started_at).toISOString()} endedAt={null} />
              ) : (
                formatDuration(locale, stats.durationSeconds)
              )}
            </dd>
          </div>
          <div>
            <dt className="training-muted text-xs">{t("logger.metric.sets")}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {stats.completedSets}
              <span className="training-muted text-sm"> / {stats.totalSets}</span>
            </dd>
          </div>
          <div>
            <dt className="training-muted text-xs">{t("logger.metric.volume")}</dt>
            <dd className="text-lg font-semibold tabular-nums">{hasVolume ? formatVolumeKg(stats.volumeKg, locale) : "—"}</dd>
          </div>
        </dl>
        <p role="status" className="training-muted mt-1 truncate px-1 text-xs">
          {ready ? t(SYNC_STATE_KEYS[syncState]) : t("common.loading")}
        </p>
      </header>

      {syncError ? (
        <p role="alert" className="mt-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-text)]">
          {syncError}
        </p>
      ) : null}

      <div className="training-muted mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>{formatDateTimeInTimeZone(new Date(workout.started_at), timeZone, locale)}</span>
        <button
          type="button"
          disabled={!active || !ready}
          onClick={() => setRestEditing("default")}
          className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-3 text-sm hover:bg-[var(--bg-surface-hover)]"
        >
          {t("logger.rest.defaults")}
        </button>
      </div>
      {workout.notes ? <p className="training-muted mt-2 whitespace-pre-wrap text-sm">{workout.notes}</p> : null}

      {exercises.length === 0 ? (
        <div className="training-panel mt-4 rounded-2xl border-dashed px-5 py-10 text-center">
          <p className="text-lg font-semibold">{t("logger.exercise.emptyTitle")}</p>
          <p className="training-muted mt-2 text-sm">{t("logger.exercise.emptyActive")}</p>
        </div>
      ) : (
        <ol className="mt-4 space-y-4">
          {groups.map((group) => {
            const superset = group.key !== null && group.exercises.length > 1;
            return (
              <li key={group.exercises[0].id} className={superset ? "rounded-2xl border border-[var(--border-strong)] p-2" : EXERCISE_CARD}>
                {superset ? (
                  <>
                    <p className="mb-2 px-2 text-xs font-semibold text-[var(--accent-text)]">
                      {t("logger.superset.title")} · {t("logger.superset.hint")}
                    </p>
                    <div className="space-y-3">
                      {group.exercises.map((exercise) => (
                        <section key={exercise.id} className={EXERCISE_CARD}>
                          {renderExercise(exercise)}
                        </section>
                      ))}
                    </div>
                  </>
                ) : (
                  renderExercise(group.exercises[0])
                )}
              </li>
            );
          })}
        </ol>
      )}

      {active ? (
        <div className="mt-5 space-y-3">
          <button
            type="button"
            disabled={!ready}
            onClick={() => setPickerOpen(true)}
            className="training-action min-h-12 w-full rounded-xl px-4 text-base font-bold disabled:opacity-40"
          >
            + {t("logger.exercise.add")}
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              setDiscardError(null);
              setConfirm({ kind: "discard" });
            }}
            className="min-h-11 w-full rounded-xl px-4 text-sm text-[var(--danger-text)] hover:bg-[var(--danger-bg)]"
          >
            {t("logger.discard.title")}
          </button>
        </div>
      ) : (
        <p className="training-muted mt-5 text-sm">{t("logger.finish.pending")}</p>
      )}

      {ready ? (
        <RestTimer
          workoutId={workout.id}
          userId={userId}
          anchorId={restAnchorId}
          validAnchorIds={completedIds}
          anchor={restAnchor?.toISOString() ?? null}
          restSeconds={restSeconds}
          workoutActive={active}
        />
      ) : null}

      {pickerOpen ? (
        <Modal
          title={t("logger.exercise.add")}
          onClose={() => setPickerOpen(false)}
          variant="training"
          panelClassName="training-picker-modal max-w-xl"
        >
          <WorkoutExercisePicker
            exercises={library}
            muscles={muscles}
            equipment={equipment}
            excludeIds={addedTemplateIds}
            recentIds={recentExerciseIds}
            workouts={workouts}
            timeZone={timeZone}
            onAdd={addExercises}
            onClose={() => setPickerOpen(false)}
          />
        </Modal>
      ) : null}

      {restEditing ? (
        <Modal
          title={restEditing === "default" ? t("logger.rest.defaults") : editingExercise?.template.title ?? t("logger.rest.defaults")}
          onClose={() => setRestEditing(null)}
          variant="training"
          panelClassName="max-w-sm"
        >
          <label className="mt-4 block space-y-2 text-sm">
            <span>{t(restEditing === "default" ? "logger.rest.deviceDefault" : "logger.rest.override")}</span>
            <select
              aria-label={t("logger.rest.duration")}
              value={restValue}
              className="training-input min-h-12 w-full rounded-xl px-3 text-base"
              onChange={(event) => {
                const value = event.target.value === "default" ? null : Number(event.target.value);
                if (restEditing === "default" && value !== null) {
                  updateDeviceRestPrefs({ defaultRestSeconds: value });
                } else if (editingExercise) {
                  changeExercise(editingExercise.id, { rest_seconds: value });
                }
              }}
            >
              {restEditing !== "default" ? (
                <option value="default">
                  {t("logger.rest.inherit", {
                    value:
                      restPrefs.defaultRestSeconds === 0
                        ? t("logger.rest.off")
                        : formatDuration(locale, restPrefs.defaultRestSeconds),
                  })}
                </option>
              ) : null}
              {restOptions
                .sort((a, b) => a - b)
                .map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds === 0 ? t("logger.rest.off") : formatDuration(locale, seconds)}
                  </option>
                ))}
            </select>
          </label>

          {restEditing === "default" ? (
            <div className="mt-4 space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">{t("account.rest.sound")}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={restPrefs.soundEnabled}
                  aria-label={t("account.rest.sound")}
                  onClick={() => updateDeviceRestPrefs({ soundEnabled: !restPrefs.soundEnabled })}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border ${
                    restPrefs.soundEnabled
                      ? "border-[var(--border-strong)] bg-[var(--accent)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full transition-transform ${
                      restPrefs.soundEnabled
                        ? "translate-x-6 bg-[var(--accent-fg)]"
                        : "translate-x-1 bg-[var(--text-muted)]"
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">{t("account.rest.vibration")}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={restPrefs.vibrationEnabled}
                  aria-label={t("account.rest.vibration")}
                  onClick={() => updateDeviceRestPrefs({ vibrationEnabled: !restPrefs.vibrationEnabled })}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border ${
                    restPrefs.vibrationEnabled
                      ? "border-[var(--border-strong)] bg-[var(--accent)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full transition-transform ${
                      restPrefs.vibrationEnabled
                        ? "translate-x-6 bg-[var(--accent-fg)]"
                        : "translate-x-1 bg-[var(--text-muted)]"
                    }`}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  triggerRestCompletionAlert({
                    soundEnabled: restPrefs.soundEnabled,
                    vibrationEnabled: restPrefs.vibrationEnabled,
                  })
                }
                className="min-h-10 w-full rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-semibold hover:bg-[var(--bg-surface-hover)]"
              >
                {t("account.rest.preview")}
              </button>
            </div>
          ) : null}

          <p className="training-muted mt-3 text-sm">{t("logger.rest.scope")}</p>
          <button
            type="button"
            onClick={() => setRestEditing(null)}
            className="training-action mt-4 min-h-11 w-full rounded-xl px-4 font-semibold"
          >
            {t("common.done")}
          </button>
        </Modal>
      ) : null}

      {confirm ? (
        <Modal
          variant="training"
          title={
            confirm.kind === "finish"
              ? t("logger.finish.review")
              : confirm.kind === "discard"
                ? t("logger.discard.title")
                : t("logger.exercise.removeTitle")
          }
          onClose={() => {
            if (!discarding && !finishing) setConfirm(null);
          }}
          panelClassName="max-w-md"
        >
          {confirm.kind === "finish" ? (
            <>
              <h2 className="mt-4 break-words text-xl font-semibold">{workout.title}</h2>
              <dl className="training-panel mt-4 grid grid-cols-3 gap-3 rounded-xl p-3">
                <div>
                  <dt className="training-muted text-xs">{t("logger.metric.duration")}</dt>
                  <dd className="mt-1 font-semibold">{formatDuration(locale, stats.durationSeconds)}</dd>
                </div>
                <div>
                  <dt className="training-muted text-xs">{t("logger.metric.sets")}</dt>
                  <dd className="mt-1 font-semibold">{stats.completedSets}</dd>
                </div>
                <div>
                  <dt className="training-muted text-xs">{t("logger.metric.volume")}</dt>
                  <dd className="mt-1 font-semibold">{hasVolume ? formatVolumeKg(stats.volumeKg, locale) : "—"}</dd>
                </div>
              </dl>
              <p className="training-muted mt-4 text-sm">{t("logger.finish.unchecked", { count: incompleteSets })}</p>
              {syncError ? <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{syncError}</p> : null}
              {!active ? <p className="training-muted mt-3 text-sm">{t("logger.finish.pending")}</p> : null}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  disabled={finishing || !active}
                  className="min-h-12 rounded-xl border border-[var(--border-subtle)] px-3 text-sm font-semibold disabled:opacity-40"
                >
                  {t("logger.finish.keep")}
                </button>
                <button
                  type="button"
                  onClick={() => void finishNow()}
                  disabled={finishing}
                  className="training-action min-h-12 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
                >
                  {finishing ? t("logger.finish.finishing") : t("logger.finish.save")}
                </button>
              </div>
            </>
          ) : confirm.kind === "discard" ? (
            <>
              <p className="training-muted mt-4 text-sm">{t("logger.discard.body")}</p>
              {discardError ? <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{discardError}</p> : null}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  disabled={discarding}
                  className="min-h-12 rounded-xl border border-[var(--border-subtle)] px-4 font-semibold"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void discard()}
                  disabled={discarding}
                  className="min-h-12 rounded-xl bg-[var(--danger-solid)] px-4 font-semibold text-white"
                >
                  {discarding ? t("logger.discard.confirming") : t("logger.discard.title")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="training-muted mt-4 text-sm">
                {t("logger.exercise.removeConfirm", {
                  title: confirm.title,
                  tail: t("logger.exercise.removeSets", { count: confirm.setCount }),
                })}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  className="min-h-12 rounded-xl border border-[var(--border-subtle)] px-4 font-semibold"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => removeExercise(confirm.exerciseId)}
                  className="min-h-12 rounded-xl bg-[var(--danger-solid)] px-4 font-semibold text-white"
                >
                  {t("common.remove")}
                </button>
              </div>
            </>
          )}
        </Modal>
      ) : null}
    </main>
  );
}
