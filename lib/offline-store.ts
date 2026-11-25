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
const PENDING_VAULT_PREFIX = "forte-pending:";
const PENDING_VAULT_VERSION = 1;

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
const VAULT_STORE_NAMES = [WORKOUTS, ROUTINES, PENDING_ROUTINES, META];

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

function vaultDbName(userId: string): string {
  return `${PENDING_VAULT_PREFIX}${encodeURIComponent(userId)}`;
}

function openVaultDatabase(userId: string): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  let request: IDBOpenDBRequest;
  try {
    request = indexedDB.open(vaultDbName(userId), PENDING_VAULT_VERSION);
  } catch (error) {
    return Promise.reject(error);
  }
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const name of VAULT_STORE_NAMES) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () =>
    reject(request.error ?? new Error("Failed to open the per-account pending vault."));
  request.onblocked = () =>
    reject(new Error("The per-account pending vault is blocked by another connection."));
  return promise;
}

function deleteVaultDatabase(userId: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  let request: IDBOpenDBRequest;
  try {
    request = indexedDB.deleteDatabase(vaultDbName(userId));
  } catch (error) {
    return Promise.reject(error);
  }
  request.onsuccess = () => resolve();
  request.onerror = () =>
    reject(request.error ?? new Error("Failed to remove the per-account pending vault."));
  request.onblocked = () => resolve();
  return promise;
}

async function vaultMayExist(userId: string): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  if (typeof indexedDB.databases === "function") {
    try {
      const list = await indexedDB.databases();
      const target = vaultDbName(userId);
      return list.some((info) => info.name === target);
    } catch {
      return true;
    }
  }
  return true;
}

interface PendingBundle {
  ownerId: string | null;
  workouts: LoggedWorkout[];
  routines: RoutineTree[];
  pendingRoutines: PendingRoutineEntry[];
}

async function readPendingBundleFromActive(db: IDBDatabase): Promise<PendingBundle> {
  return transact(db, [META, WORKOUTS, PENDING, ROUTINES, PENDING_ROUTINES], "readonly", async (tx) => {
    const owner = (await fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY))) ?? null;
    const pendingWorkoutKeys = (await fromRequest(tx.objectStore(PENDING).getAllKeys())).map(String);
    const workouts: LoggedWorkout[] = [];
    for (const id of pendingWorkoutKeys) {
      const doc = await fromRequest<LoggedWorkout | undefined>(tx.objectStore(WORKOUTS).get(id));
      if (doc) workouts.push(doc);
    }
    const pendingRoutines = await fromRequest<PendingRoutineEntry[]>(
      tx.objectStore(PENDING_ROUTINES).getAll(),
    );
    const routines: RoutineTree[] = [];
    for (const entry of pendingRoutines) {
      const doc = await fromRequest<RoutineTree | undefined>(tx.objectStore(ROUTINES).get(entry.id));
      if (doc) routines.push(doc);
    }
    return { ownerId: owner, workouts, routines, pendingRoutines };
  });
}

/**
 * Durably copies an account's unsynced workouts and routine edits into a
 * per-account IndexedDB vault (`forte-pending:<userId>`) so signing out or
 * switching accounts never silently discards pending work while keeping it
 * invisible to signed-out users and every other account.
 */
async function stashPendingToVault(activeDb: IDBDatabase, ownerId: string): Promise<void> {
  if (!ownerId || ownerId === LOCAL_GUEST_OWNER) return;
  const bundle = await readPendingBundleFromActive(activeDb);
  if (bundle.ownerId !== ownerId) return;
  if (bundle.workouts.length === 0 && bundle.pendingRoutines.length === 0) return;

  const vaultDb = await openVaultDatabase(ownerId);
  try {
    await transact(vaultDb, VAULT_STORE_NAMES, "readwrite", async (tx) => {
      await fromRequest(tx.objectStore(META).put(ownerId, OWNER_KEY));
      const wStore = tx.objectStore(WORKOUTS);
      for (const workout of bundle.workouts) {
        await fromRequest(wStore.put(workout, workout.id));
      }
      const rStore = tx.objectStore(ROUTINES);
      for (const routine of bundle.routines) {
        await fromRequest(rStore.put(routine, routine.id));
      }
      const prStore = tx.objectStore(PENDING_ROUTINES);
      for (const entry of bundle.pendingRoutines) {
        await fromRequest(prStore.put(entry, entry.id));
      }
    });
  } finally {
    vaultDb.close();
  }
}

/**
 * Restores any privately vaulted unsynced workouts/routines for `userId` into
 * the active store, then removes the vault only after the active commit lands.
 */
async function restorePendingFromVault(activeDb: IDBDatabase, userId: string): Promise<void> {
  if (!userId || userId === LOCAL_GUEST_OWNER) return;
  if (!(await vaultMayExist(userId))) return;

  const vaultDb = await openVaultDatabase(userId);
  let vaultedWorkouts: LoggedWorkout[] = [];
  let vaultedRoutines: RoutineTree[] = [];
  let vaultedPendingRoutines: PendingRoutineEntry[] = [];
  let vaultOwner: string | undefined;
  try {
    const readResult = await transact(vaultDb, VAULT_STORE_NAMES, "readonly", async (tx) => {
      const owner = await fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY));
      const workouts = await fromRequest<LoggedWorkout[]>(tx.objectStore(WORKOUTS).getAll());
      const routines = await fromRequest<RoutineTree[]>(tx.objectStore(ROUTINES).getAll());
      const pendingRoutines = await fromRequest<PendingRoutineEntry[]>(
        tx.objectStore(PENDING_ROUTINES).getAll(),
      );
      return { owner, workouts, routines, pendingRoutines };
    });
    vaultOwner = readResult.owner;
    vaultedWorkouts = readResult.workouts;
    vaultedRoutines = readResult.routines;
    vaultedPendingRoutines = readResult.pendingRoutines;
  } finally {
    vaultDb.close();
  }

  if (
    vaultOwner === userId &&
    (vaultedWorkouts.length > 0 || vaultedPendingRoutines.length > 0)
  ) {
    await transact(activeDb, [WORKOUTS, PENDING, ROUTINES, PENDING_ROUTINES], "readwrite", async (tx) => {
      const wStore = tx.objectStore(WORKOUTS);
      const pStore = tx.objectStore(PENDING);
      for (const workout of vaultedWorkouts) {
        const alreadyPending = await fromRequest<string | undefined>(pStore.get(workout.id));
        if (!alreadyPending) {
          await fromRequest(pStore.put(workout.id, workout.id));
          await fromRequest(wStore.put(workout, workout.id));
        }
      }
      const rStore = tx.objectStore(ROUTINES);
      const prStore = tx.objectStore(PENDING_ROUTINES);
      const routineById = new Map(vaultedRoutines.map((r) => [r.id, r]));
      for (const entry of vaultedPendingRoutines) {
        const alreadyPending = await fromRequest<PendingRoutineEntry | undefined>(
          prStore.get(entry.id),
        );
        if (!alreadyPending) {
          await fromRequest(prStore.put(entry, entry.id));
          const tree = routineById.get(entry.id);
          if (tree) await fromRequest(rStore.put(tree, tree.id));
        }
      }
    });
  }

  // Delete vault only after the active store transaction committed cleanly.
  await deleteVaultDatabase(userId).catch(() => {});
}

async function claimOwner(db: IDBDatabase, userId: string): Promise<boolean> {
  const currentOwner = await transact(db, [META], "readonly", async (tx) =>
    fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY)),
  );

  let ownerChanged = false;
  if (currentOwner !== userId) {
    if (currentOwner !== undefined && currentOwner !== LOCAL_GUEST_OWNER) {
      // Preserve the previous account's unsynced work in its private vault before clearing.
      await stashPendingToVault(db, currentOwner);
    }
    await transact(db, STORE_NAMES, "readwrite", async (tx) => {
      if (currentOwner !== undefined) {
        for (const name of STORE_NAMES) {
          await fromRequest(tx.objectStore(name).clear());
        }
      }
      await fromRequest(tx.objectStore(META).put(userId, OWNER_KEY));
    });
    ownerChanged = true;
  }

  // Restore any previously vaulted pending edits belonging strictly to `userId`.
  await restorePendingFromVault(db, userId);
  return ownerChanged;
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

export async function clearOfflineClientData(options?: {
  discardPending?: boolean;
}): Promise<void> {
  const discardPending = options?.discardPending ?? false;
  const operations: Promise<unknown>[] = [clearPrivateRouteCaches()];
  if (typeof indexedDB !== "undefined") {
    operations.push(
      openDatabase().then((db) =>
        serialized(async () => {
          const owner = await transact(db, [META], "readonly", (tx) =>
            fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY)),
          );
          if (owner && owner !== LOCAL_GUEST_OWNER) {
            if (discardPending) {
              await deleteVaultDatabase(owner);
            } else {
              await stashPendingToVault(db, owner);
            }
          }
          await createStore(db).clear();
        }),
      ),
    );
  }
  const results = await Promise.allSettled(operations);
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
}

export async function readActivePendingCount(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const existing = await openExistingOfflineStore();
    if (!existing) return 0;
    const [pendingWorkouts, pendingRoutines] = await Promise.all([
      existing.store.pendingWorkoutIds(),
      existing.store.pendingRoutines(),
    ]);
    return pendingWorkouts.length + pendingRoutines.length;
  } catch {
    return 0;
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
