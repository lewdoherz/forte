import type { ExerciseType, RoutineTree } from "@/schema/types";
import type { LoggedWorkout } from "@/lib/workout-sync";
import type { PreviousPerformance } from "@/lib/previous-performance";
import type { RoutineInput } from "@/lib/routines";

/**
 * Account-scoped offline store in IndexedDB (`forte-offline`, v2).
 *
 * One IndexedDB database per origin. The database belongs to exactly one user:
 * `meta.owner_id` records the owner, and opening for a different user atomically
 * clears every store and private route cache before returning. Re-authenticating
 * as the same user after session expiry preserves all pending work.
 */

const DB_NAME = "forte-offline";
const DB_VERSION = 2;

const PRIVATE_CACHE_PREFIX = "forte-private-";
const CLEAR_PRIVATE_CACHE_MESSAGE = "clear-private-cache";
const CACHE_PRIVATE_ROUTE_MESSAGE = "cache-private-route";
const WARM_OFFLINE_SHELL_MESSAGE = "warm-offline-shell";

const WORKOUTS = "workouts";
const PENDING = "pending";
const META = "meta";
const ROUTINES = "routines";
const PENDING_ROUTINES = "pending_routines";
const CATALOG = "catalog";

const OWNER_KEY = "owner_id";
const SYNCED_KEY = "last_synced_at";
const CATALOG_KEY = "snapshot";

const STORE_NAMES = [WORKOUTS, PENDING, META, ROUTINES, PENDING_ROUTINES, CATALOG];

export const LOCAL_GUEST_OWNER = "local-guest";

export interface OfflineCatalogExercise {
  id: string;
  slug: string;
  title: string;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: string;
  exercise_type: ExerciseType;
  how_to: string | null;
  is_custom: boolean;
}

export interface OfflineVocabularyEntry {
  code: string;
  display_name: string;
}

export interface OfflineProfileSummary {
  id: string;
  email: string;
  displayName: string;
  timeZone: string;
  locale: string;
}

export interface OfflineCatalogSnapshot {
  profile: OfflineProfileSummary;
  muscles: OfflineVocabularyEntry[];
  equipment: OfflineVocabularyEntry[];
  exercises: OfflineCatalogExercise[];
  previousPerformances: Record<string, PreviousPerformance>;
  cachedAt: string;
}

export interface PendingRoutineEntry {
  id: string;
  op: "upsert" | "delete";
  input?: RoutineInput;
  updatedAt: string;
}

export interface OfflineStore {
  ownerId(): Promise<string | null>;
  readWorkout(workoutId: string): Promise<LoggedWorkout | undefined>;
  listWorkouts(): Promise<LoggedWorkout[]>;
  writeWorkout(workout: LoggedWorkout): Promise<void>;
  deleteWorkout(workoutId: string): Promise<void>;
  markPending(workoutId: string): Promise<void>;
  clearPending(workoutId: string): Promise<void>;
  pendingWorkoutIds(): Promise<string[]>;
  readRoutine(routineId: string): Promise<RoutineTree | undefined>;
  listRoutines(): Promise<RoutineTree[]>;
  writeRoutine(routine: RoutineTree): Promise<void>;
  deleteRoutine(routineId: string): Promise<void>;
  markRoutinePending(entry: PendingRoutineEntry): Promise<void>;
  clearRoutinePending(routineId: string): Promise<void>;
  pendingRoutines(): Promise<PendingRoutineEntry[]>;
  readCatalog(): Promise<OfflineCatalogSnapshot | undefined>;
  writeCatalog(snapshot: OfflineCatalogSnapshot): Promise<void>;
  lastSyncedAt(): Promise<string | null>;
  setLastSyncedAt(iso: string): Promise<void>;
  clear(): Promise<void>;
}

let connection: Promise<IDBDatabase> | null = null;
let ownerGate: Promise<unknown> = Promise.resolve();

function fromRequest<T>(request: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  return promise;
}

function transact<T>(
  db: IDBDatabase,
  names: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();

  let tx: IDBTransaction;
  try {
    tx = db.transaction(names, mode);
  } catch (error) {
    return Promise.reject(error);
  }

  let result!: T;
  let failed = false;
  const fail = (error: DOMException | null) => {
    if (failed) return;
    failed = true;
    reject(error ?? new Error("IndexedDB transaction failed."));
  };
  tx.oncomplete = () => {
    if (!failed) resolve(result);
  };
  tx.onerror = () => fail(tx.error);
  tx.onabort = () => fail(tx.error);
  Promise.resolve()
    .then(() => run(tx))
    .then(
      (value) => {
        result = value;
      },
      (error) => {
        failed = true;
        reject(error);
        try {
          tx.abort();
        } catch {
          // Already finished.
        }
      },
    );
  return promise;
}

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;

  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  let request: IDBOpenDBRequest;
  try {
    request = indexedDB.open(DB_NAME, DB_VERSION);
  } catch (error) {
    return Promise.reject(error);
  }

  request.onupgradeneeded = () => {
    const db = request.result;
    for (const name of STORE_NAMES) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    }
  };

  request.onsuccess = () => {
    const db = request.result;
    db.onversionchange = () => {
      db.close();
      if (connection === promise) connection = null;
    };
    resolve(db);
  };

  request.onerror = () =>
    reject(request.error ?? new Error("Failed to open the offline database."));
  request.onblocked = () =>
    reject(new Error("The offline database is blocked by another open connection."));

  promise.catch(() => {
    if (connection === promise) connection = null;
  });
  connection = promise;
  return promise;
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = ownerGate.then(task, task);
  ownerGate = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function claimOwner(db: IDBDatabase, userId: string): Promise<boolean> {
  return transact(db, STORE_NAMES, "readwrite", async (tx) => {
    const meta = tx.objectStore(META);
    const owner = await fromRequest<string | undefined>(meta.get(OWNER_KEY));
    if (owner === userId) return false;

    if (owner !== undefined) {
      for (const name of STORE_NAMES) {
        await fromRequest(tx.objectStore(name).clear());
      }
    }
    await fromRequest(meta.put(userId, OWNER_KEY));
    return true;
  });
}

function createStore(db: IDBDatabase): OfflineStore {
  const read = <T>(names: string[], run: (tx: IDBTransaction) => Promise<T>): Promise<T> =>
    transact(db, names, "readonly", run);
  const write = (names: string[], run: (tx: IDBTransaction) => Promise<unknown>): Promise<void> =>
    transact<void>(db, names, "readwrite", async (tx) => {
      await run(tx);
    });

  return {
    ownerId: () =>
      read([META], async (tx) => {
        const value = await fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY));
        return value ?? null;
      }),

    readWorkout: (workoutId) =>
      read([WORKOUTS], (tx) =>
        fromRequest<LoggedWorkout | undefined>(tx.objectStore(WORKOUTS).get(workoutId)),
      ),

    listWorkouts: () =>
      read([WORKOUTS], async (tx) => {
        const items = await fromRequest<LoggedWorkout[]>(tx.objectStore(WORKOUTS).getAll());
        return items.sort(
          (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
        );
      }),

    writeWorkout: (workout) =>
      write([WORKOUTS], (tx) => fromRequest(tx.objectStore(WORKOUTS).put(workout, workout.id))),

    deleteWorkout: (workoutId) =>
      write([WORKOUTS, PENDING], async (tx) => {
        await fromRequest(tx.objectStore(WORKOUTS).delete(workoutId));
        await fromRequest(tx.objectStore(PENDING).delete(workoutId));
      }),

    markPending: (workoutId) =>
      write([PENDING], (tx) => fromRequest(tx.objectStore(PENDING).put(workoutId, workoutId))),

    clearPending: (workoutId) =>
      write([PENDING], (tx) => fromRequest(tx.objectStore(PENDING).delete(workoutId))),

    pendingWorkoutIds: () =>
      read([PENDING], async (tx) => {
        const keys = await fromRequest(tx.objectStore(PENDING).getAllKeys());
        return keys.map((key) => String(key));
      }),

    readRoutine: (routineId) =>
      read([ROUTINES], (tx) =>
        fromRequest<RoutineTree | undefined>(tx.objectStore(ROUTINES).get(routineId)),
      ),

    listRoutines: () =>
      read([ROUTINES], async (tx) => {
        const items = await fromRequest<RoutineTree[]>(tx.objectStore(ROUTINES).getAll());
        return items.sort((a, b) => a.title.localeCompare(b.title));
      }),

    writeRoutine: (routine) =>
      write([ROUTINES], (tx) => fromRequest(tx.objectStore(ROUTINES).put(routine, routine.id))),

    deleteRoutine: (routineId) =>
      write([ROUTINES], (tx) => fromRequest(tx.objectStore(ROUTINES).delete(routineId))),

    markRoutinePending: (entry) =>
      write([PENDING_ROUTINES], (tx) =>
        fromRequest(tx.objectStore(PENDING_ROUTINES).put(entry, entry.id)),
      ),

    clearRoutinePending: (routineId) =>
      write([PENDING_ROUTINES], (tx) =>
        fromRequest(tx.objectStore(PENDING_ROUTINES).delete(routineId)),
      ),

    pendingRoutines: () =>
      read([PENDING_ROUTINES], (tx) =>
        fromRequest<PendingRoutineEntry[]>(tx.objectStore(PENDING_ROUTINES).getAll()),
      ),

    readCatalog: () =>
      read([CATALOG], (tx) =>
        fromRequest<OfflineCatalogSnapshot | undefined>(tx.objectStore(CATALOG).get(CATALOG_KEY)),
      ),

    writeCatalog: (snapshot) =>
      write([CATALOG], (tx) => fromRequest(tx.objectStore(CATALOG).put(snapshot, CATALOG_KEY))),

    lastSyncedAt: () =>
      read([META], async (tx) => {
        const value = await fromRequest<string | undefined>(tx.objectStore(META).get(SYNCED_KEY));
        return value ?? null;
      }),

    setLastSyncedAt: (iso) =>
      write([META], (tx) => fromRequest(tx.objectStore(META).put(iso, SYNCED_KEY))),

    clear: () =>
      write(STORE_NAMES, async (tx) => {
        for (const name of STORE_NAMES) {
          await fromRequest(tx.objectStore(name).clear());
        }
      }),
  };
}

async function clearPrivateRouteCaches(): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    navigator.serviceWorker.controller.postMessage({ type: CLEAR_PRIVATE_CACHE_MESSAGE });
  }

  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(PRIVATE_CACHE_PREFIX))
      .map((key) => caches.delete(key)),
  );
}

export async function clearOfflineClientData(): Promise<void> {
  const operations: Promise<unknown>[] = [clearPrivateRouteCaches()];
  if (typeof indexedDB !== "undefined") {
    operations.push(
      openDatabase().then((db) => serialized(() => createStore(db).clear())),
    );
  }
  const results = await Promise.allSettled(operations);
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
}

export function cacheCurrentOfflineRoute(): void {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !navigator.serviceWorker.controller ||
    typeof location === "undefined"
  ) {
    return;
  }
  navigator.serviceWorker.controller.postMessage({
    type: CACHE_PRIVATE_ROUTE_MESSAGE,
    url: location.href,
  });
}

/**
 * Asks the active service worker to cache the static offline app shell
 * (`/offline-app`) and any public exercise thumbnails so cold launch works
 * in airplane mode. Contains zero personalized HTML.
 */
export function warmOfflineShell(thumbnailSlugs: string[] = []): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const thumbnails = [...new Set(thumbnailSlugs)]
    .filter(Boolean)
    .slice(0, 120)
    .map((slug) => `/exercise-media/thumbnails/${encodeURIComponent(slug)}.jpg`);
  const send = (target: ServiceWorker | null | undefined) => {
    target?.postMessage({
      type: WARM_OFFLINE_SHELL_MESSAGE,
      thumbnails,
    });
  };
  if (navigator.serviceWorker.controller) {
    send(navigator.serviceWorker.controller);
  } else {
    void navigator.serviceWorker.ready
      .then((reg) => send(reg.active))
      .catch(() => {});
  }
}

export async function openOfflineStore(userId: string): Promise<OfflineStore> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline logging needs IndexedDB, which this browser does not provide.");
  }
  const db = await openDatabase();
  const ownerChanged = await serialized(() => claimOwner(db, userId));
  if (ownerChanged) await clearPrivateRouteCaches();
  return createStore(db);
}

/**
 * Opens the existing device store during an offline cold start when no server
 * session check is possible. Returns `null` if no account has claimed the
 * device yet (fresh install or after sign-out).
 */
export async function openExistingOfflineStore(): Promise<{
  ownerId: string;
  store: OfflineStore;
} | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDatabase();
  const store = createStore(db);
  const owner = await store.ownerId();
  if (!owner) return null;
  return { ownerId: owner, store };
}

export async function prepareOfflineDataForUser(userId: string): Promise<void> {
  await clearPrivateRouteCaches();
  await openOfflineStore(userId);
}
