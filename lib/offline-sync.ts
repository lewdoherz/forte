import type { RoutineTree, WorkoutSet } from "@/schema/types";
import type { LoggedWorkout, WorkoutSyncInput } from "@/lib/workout-sync";
import type { RoutineInput } from "@/lib/routines";
import {
  LOCAL_GUEST_OWNER,
  openExistingOfflineStore,
  openOfflineStore,
  warmOfflineShell,
  type OfflineCatalogSnapshot,
  type OfflineStore,
  type PendingRoutineEntry,
} from "@/lib/offline-store";

export type OfflineSyncStatus =
  | "idle"
  | "syncing"
  | "synced"
  | "offline"
  | "auth_required"
  | "error";

export interface OfflineSyncSnapshot {
  status: OfflineSyncStatus;
  pendingCount: number;
  pendingWorkoutIds: string[];
  pendingRoutineIds: string[];
  lastSyncedAt: string | null;
  error: string | null;
  flushedCount?: number;
}

export const OFFLINE_SYNC_EVENT = "forte:offline-sync-status";

let inflightSync: Promise<OfflineSyncSnapshot> | null = null;

function hydrateDatesOnWorkout(raw: unknown): LoggedWorkout {
  const w = raw as LoggedWorkout & {
    started_at: string | Date;
    ended_at: string | Date | null;
    created_at: string | Date;
    updated_at: string | Date;
  };
  return {
    ...w,
    started_at: new Date(w.started_at),
    ended_at: w.ended_at ? new Date(w.ended_at) : null,
    created_at: new Date(w.created_at),
    updated_at: new Date(w.updated_at),
    exercises: (w.exercises ?? []).map((ex) => ({
      ...ex,
      created_at: new Date(ex.created_at),
      updated_at: new Date(ex.updated_at),
      sets: (ex.sets ?? []).map((s) => ({
        ...s,
        completed_at: s.completed_at ? new Date(s.completed_at) : null,
        created_at: new Date(s.created_at),
        updated_at: new Date(s.updated_at),
      })),
    })),
  };
}

function hydrateDatesOnRoutine(raw: unknown): RoutineTree {
  const r = raw as RoutineTree & { created_at: string | Date; updated_at: string | Date };
  return {
    ...r,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
    exercises: (r.exercises ?? []).map((ex) => ({
      ...ex,
      created_at: new Date(ex.created_at),
      updated_at: new Date(ex.updated_at),
      sets: (ex.sets ?? []).map((s) => ({
        ...s,
        created_at: new Date(s.created_at),
        updated_at: new Date(s.updated_at),
      })),
    })),
  };
}

export function workoutToSyncPayload(doc: LoggedWorkout): {
  sync: WorkoutSyncInput;
  createdMeta: {
    title: string;
    notes: string | null;
    routineId: string | null;
    startedAt: string;
  };
} {
  return {
    sync: {
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
    },
    createdMeta: {
      title: doc.title,
      notes: doc.notes,
      routineId: doc.routine_id,
      startedAt: new Date(doc.started_at).toISOString(),
    },
  };
}

export function emitSyncSnapshot(snapshot: OfflineSyncSnapshot): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_EVENT, { detail: snapshot }));
  }
}

export async function readOfflineSyncSnapshot(store: OfflineStore): Promise<OfflineSyncSnapshot> {
  const [pendingWorkoutIds, pendingRoutines, lastSyncedAt] = await Promise.all([
    store.pendingWorkoutIds(),
    store.pendingRoutines(),
    store.lastSyncedAt(),
  ]);
  const pendingRoutineIds = pendingRoutines.map((r) => r.id);
  const pendingCount = pendingWorkoutIds.length + pendingRoutineIds.length;
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  return {
    status: pendingCount === 0 ? "synced" : online ? "idle" : "offline",
    pendingCount,
    pendingWorkoutIds,
    pendingRoutineIds,
    lastSyncedAt,
    error: null,
  };
}

/**
 * Flushes pending offline routines and workouts to `/api/offline/sync`.
 * Preserves all pending items if offline, on transient error, or on HTTP 401
 * session expiry so work is never lost and retries remain idempotent.
 */
export async function flushOfflineQueue(store: OfflineStore): Promise<OfflineSyncSnapshot> {
  const owner = await store.ownerId();
  const base = await readOfflineSyncSnapshot(store);
  if (!owner || owner === LOCAL_GUEST_OWNER) {
    emitSyncSnapshot(base);
    return base;
  }
  if (base.pendingCount === 0) {
    const synced: OfflineSyncSnapshot = { ...base, status: "synced" };
    emitSyncSnapshot(synced);
    return synced;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const off: OfflineSyncSnapshot = { ...base, status: "offline" };
    emitSyncSnapshot(off);
    return off;
  }

  emitSyncSnapshot({ ...base, status: "syncing" });

  const [pendingRoutines, pendingWorkoutIds] = await Promise.all([
    store.pendingRoutines(),
    store.pendingWorkoutIds(),
  ]);

  const workoutItems: Array<{
    sync: WorkoutSyncInput;
    createdMeta: {
      title: string;
      notes: string | null;
      routineId: string | null;
      startedAt: string;
    };
  }> = [];
  for (const id of pendingWorkoutIds) {
    const doc = await store.readWorkout(id);
    if (doc) workoutItems.push(workoutToSyncPayload(doc));
  }

  let response: Response;
  try {
    response = await fetch("/api/offline/sync", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routines: pendingRoutines.map((entry) => ({
          id: entry.id,
          op: entry.op,
          input: entry.input,
        })),
        workouts: workoutItems,
      }),
    });
  } catch {
    const offlineSnap: OfflineSyncSnapshot = {
      ...(await readOfflineSyncSnapshot(store)),
      status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error",
      error: "network",
    };
    emitSyncSnapshot(offlineSnap);
    return offlineSnap;
  }

  if (response.status === 401) {
    const authSnap: OfflineSyncSnapshot = {
      ...(await readOfflineSyncSnapshot(store)),
      status: "auth_required",
      error: "unauthorized",
    };
    emitSyncSnapshot(authSnap);
    return authSnap;
  }

  if (!response.ok) {
    const errSnap: OfflineSyncSnapshot = {
      ...(await readOfflineSyncSnapshot(store)),
      status: "error",
      error: `http_${response.status}`,
    };
    emitSyncSnapshot(errSnap);
    return errSnap;
  }

  const data = (await response.json()) as {
    ok?: boolean;
    syncedAt?: string;
    routines?: Array<{ id: string; ok: boolean; error?: string }>;
    workouts?: Array<{ id: string; ok: boolean; error?: string }>;
  };

  let hadFailure = false;
  let flushedCount = 0;
  for (const r of data.routines ?? []) {
    if (r.ok) {
      await store.clearRoutinePending(r.id);
      flushedCount += 1;
    } else {
      hadFailure = true;
    }
  }
  for (const w of data.workouts ?? []) {
    if (w.ok) {
      await store.clearPending(w.id);
      flushedCount += 1;
    } else {
      hadFailure = true;
    }
  }

  if (!hadFailure) {
    await store.setLastSyncedAt(data.syncedAt ?? new Date().toISOString());
  }

  const finalSnap = await readOfflineSyncSnapshot(store);
  const result: OfflineSyncSnapshot = {
    ...finalSnap,
    status: finalSnap.pendingCount === 0 ? "synced" : hadFailure ? "error" : "idle",
    error: hadFailure ? "partial" : null,
    flushedCount,
  };
  emitSyncSnapshot(result);
  return result;
}

/**
 * Fetches `/api/offline/bootstrap` and merges server state into IndexedDB
 * without overwriting any locally pending routine or workout.
 */
export async function refreshOfflineBootstrap(store: OfflineStore): Promise<boolean> {
  const owner = await store.ownerId();
  if (!owner || owner === LOCAL_GUEST_OWNER) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  let response: Response;
  try {
    response = await fetch("/api/offline/bootstrap", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;

  const payload = (await response.json()) as {
    profile: OfflineCatalogSnapshot["profile"];
    muscles: OfflineCatalogSnapshot["muscles"];
    equipment: OfflineCatalogSnapshot["equipment"];
    exercises: OfflineCatalogSnapshot["exercises"];
    routines: unknown[];
    activeWorkout: unknown | null;
    recentWorkouts: unknown[];
    previousPerformances: OfflineCatalogSnapshot["previousPerformances"];
    cachedAt: string;
  };

  if (payload.profile.id !== owner) return false;

  const [pendingWorkoutIds, pendingRoutines, existingRoutines, existingWorkouts] = await Promise.all([
    store.pendingWorkoutIds(),
    store.pendingRoutines(),
    store.listRoutines(),
    store.listWorkouts(),
  ]);
  const pendingWorkoutSet = new Set(pendingWorkoutIds);
  const pendingRoutineSet = new Set(pendingRoutines.map((r) => r.id));

  await store.writeCatalog({
    profile: payload.profile,
    muscles: payload.muscles,
    equipment: payload.equipment,
    exercises: payload.exercises,
    previousPerformances: payload.previousPerformances,
    cachedAt: payload.cachedAt,
  });

  // Merge routines: keep pending local routines intact; remove non-pending routines deleted on server.
  const remoteRoutineIds = new Set<string>();
  for (const rawRoutine of payload.routines) {
    const routine = hydrateDatesOnRoutine(rawRoutine);
    remoteRoutineIds.add(routine.id);
    if (!pendingRoutineSet.has(routine.id)) {
      await store.writeRoutine(routine);
    }
  }
  for (const local of existingRoutines) {
    if (!remoteRoutineIds.has(local.id) && !pendingRoutineSet.has(local.id)) {
      await store.deleteRoutine(local.id);
    }
  }

  // Merge active + recent completed workouts without clobbering pending local workouts.
  const remoteWorkoutIds = new Set<string>();
  if (payload.activeWorkout) {
    const active = hydrateDatesOnWorkout(payload.activeWorkout);
    remoteWorkoutIds.add(active.id);
    if (!pendingWorkoutSet.has(active.id)) {
      await store.writeWorkout(active);
    }
  }
  for (const rawWorkout of payload.recentWorkouts) {
    const workout = hydrateDatesOnWorkout(rawWorkout);
    remoteWorkoutIds.add(workout.id);
    if (!pendingWorkoutSet.has(workout.id)) {
      await store.writeWorkout(workout);
    }
  }
  // Remove stale non-pending active workouts that were discarded/finished elsewhere.
  for (const local of existingWorkouts) {
    if (local.ended_at === null && !remoteWorkoutIds.has(local.id) && !pendingWorkoutSet.has(local.id)) {
      await store.deleteWorkout(local.id);
    }
  }

  // Warm the offline shell + thumbnails for exercises in routines, workouts, and top catalog rows.
  const slugs = new Set<string>();
  for (const r of payload.routines as Array<{ exercises?: Array<{ template?: { slug?: string } }> }>) {
    for (const ex of r.exercises ?? []) if (ex.template?.slug) slugs.add(ex.template.slug);
  }
  for (const w of payload.recentWorkouts as Array<{ exercises?: Array<{ template?: { slug?: string } }> }>) {
    for (const ex of w.exercises ?? []) if (ex.template?.slug) slugs.add(ex.template.slug);
  }
  for (const ex of payload.exercises.slice(0, 60)) {
    if (ex.slug) slugs.add(ex.slug);
  }
  warmOfflineShell([...slugs]);

  return true;
}

/**
 * Full sync cycle for an authenticated account (or existing offline owner):
 * 1. Flushes pending routines + workouts first so server state is up to date.
 * 2. Refreshes the offline catalog/routines/history snapshot and warms the SW.
 */
export async function syncOfflineData(userId?: string): Promise<OfflineSyncSnapshot> {
  if (inflightSync) return inflightSync;
  const run = (async (): Promise<OfflineSyncSnapshot> => {
    let store: OfflineStore | null = null;
    if (userId) {
      store = await openOfflineStore(userId);
    } else {
      const existing = await openExistingOfflineStore();
      store = existing?.store ?? null;
    }
    if (!store) {
      return {
        status: "idle",
        pendingCount: 0,
        pendingWorkoutIds: [],
        pendingRoutineIds: [],
        lastSyncedAt: null,
        error: null,
      };
    }

    const flushResult = await flushOfflineQueue(store);
    if (flushResult.status !== "auth_required" && flushResult.status !== "offline") {
      await refreshOfflineBootstrap(store);
    }
    return flushResult;
  })();

  inflightSync = run;
  try {
    return await run;
  } finally {
    if (inflightSync === run) inflightSync = null;
  }
}

/**
 * Saves a created or edited routine locally in IndexedDB and queues it for sync.
 */
export async function saveRoutineOffline(
  store: OfflineStore,
  ownerId: string,
  input: RoutineInput,
  catalog: OfflineCatalogSnapshot | undefined,
): Promise<RoutineTree> {
  const now = new Date();
  const id = input.id ?? crypto.randomUUID();
  const existing = await store.readRoutine(id);
  const exerciseMap = new Map((catalog?.exercises ?? []).map((e) => [e.id, e]));

  const routineTree: RoutineTree = {
    id,
    owner_id: ownerId,
    folder_id: null,
    folder: null,
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    position: existing?.position ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    exercises: input.exercises.map((ex, i) => {
      const exId = crypto.randomUUID();
      const cat = exerciseMap.get(ex.template_id);
      const existingEx = existing?.exercises.find((e) => e.template_id === ex.template_id);
      return {
        id: exId,
        routine_id: id,
        template_id: ex.template_id,
        position: i,
        superset_key: ex.superset_key ?? null,
        rest_seconds: ex.rest_seconds ?? null,
        notes: ex.notes ?? null,
        created_at: now,
        updated_at: now,
        template: existingEx?.template ?? {
          id: ex.template_id,
          slug: cat?.slug ?? ex.template_id,
          title: cat?.title ?? "Exercise",
          title_zh: null,
          exercise_type: cat?.exercise_type ?? "weight_reps",
          primary_muscle: cat?.primary_muscle ?? "other",
          secondary_muscles: cat?.secondary_muscles ?? [],
          equipment: cat?.equipment ?? "other",
          how_to: cat?.how_to ?? null,
          how_to_zh: null,
          media_url: null,
          duration_record_direction: "higher" as const,
          is_custom: cat?.is_custom ?? false,
          owner_id: null,
          archived_at: null,
          created_at: now,
          updated_at: now,
        },
        sets: ex.sets.map((s, j) => ({
          id: crypto.randomUUID(),
          routine_exercise_id: exId,
          position: j,
          set_type: s.set_type,
          reps: s.reps ?? null,
          rep_range_start: null,
          rep_range_end: null,
          weight_kg: s.weight_kg ?? null,
          duration_seconds: s.duration_seconds ?? null,
          distance_meters: s.distance_meters ?? null,
          custom_metric: null,
          metrics: {
            ...(s.metrics?.steps != null ? { steps: s.metrics.steps } : {}),
            ...(s.metrics?.floors != null ? { floors: s.metrics.floors } : {}),
          },
          created_at: now,
          updated_at: now,
        })),
      };
    }),
  };

  const entry: PendingRoutineEntry = {
    id,
    op: "upsert",
    input: { ...input, id },
    updatedAt: now.toISOString(),
  };

  // Mark pending BEFORE writing the routine document so a crash never leaves an unqueued edit.
  await store.markRoutinePending(entry);
  await store.writeRoutine(routineTree);
  return routineTree;
}

/**
 * Snapshots a routine into a new active workout stored in IndexedDB with
 * client-generated UUIDs, matching the server's `startWorkout` semantics.
 */
export async function startWorkoutFromRoutineOffline(
  store: OfflineStore,
  ownerId: string,
  routine: RoutineTree,
): Promise<LoggedWorkout> {
  const now = new Date();
  const workoutId = crypto.randomUUID();
  const workout: LoggedWorkout = {
    id: workoutId,
    owner_id: ownerId,
    routine_id: routine.id,
    title: routine.title,
    notes: routine.notes,
    visibility: "private",
    started_at: now,
    ended_at: null,
    created_at: now,
    updated_at: now,
    exercises: routine.exercises.map((re, i) => {
      const weId = crypto.randomUUID();
      const sets: WorkoutSet[] = re.sets.map((rs, j) => ({
        id: crypto.randomUUID(),
        workout_exercise_id: weId,
        position: j,
        set_type: rs.set_type,
        reps: rs.reps,
        weight_kg: rs.weight_kg,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
        metrics: {
          forte_target: {
            reps: rs.reps,
            rep_range_start: rs.rep_range_start,
            rep_range_end: rs.rep_range_end,
            weight_kg: rs.weight_kg,
            duration_seconds: rs.duration_seconds,
            distance_meters: rs.distance_meters,
            metrics: rs.metrics,
          },
        },
        completed_at: null,
        created_at: now,
        updated_at: now,
      }));
      return {
        id: weId,
        workout_id: workoutId,
        template_id: re.template_id,
        position: i,
        superset_key: re.superset_key,
        rest_seconds: re.rest_seconds,
        notes: re.notes,
        created_at: now,
        updated_at: now,
        template: {
          id: re.template.id,
          slug: re.template.slug,
          title: re.template.title,
          exercise_type: re.template.exercise_type,
          primary_muscle: re.template.primary_muscle,
        },
        sets,
      };
    }),
  };

  await store.markPending(workout.id);
  await store.writeWorkout(workout);
  return workout;
}

/** Starts an empty workout offline with a client-generated UUID. */
export async function startEmptyWorkoutOffline(
  store: OfflineStore,
  ownerId: string,
  title = "Workout",
): Promise<LoggedWorkout> {
  const now = new Date();
  const workout: LoggedWorkout = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    routine_id: null,
    title,
    notes: null,
    visibility: "private",
    started_at: now,
    ended_at: null,
    created_at: now,
    updated_at: now,
    exercises: [],
  };
  await store.markPending(workout.id);
  await store.writeWorkout(workout);
  return workout;
}
