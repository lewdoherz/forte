import type { DurationRecordDirection, ExerciseType, RoutineFolder, RoutineTree } from "@/schema/types";
import type { LoggedWorkout } from "@/lib/workout-sync";
import type { PreviousPerformance } from "@/lib/previous-performance";
import type { RoutineFolderInput, RoutineInput } from "@/lib/routines";

/**
 * Account-scoped offline store in IndexedDB (`forte-offline`, v3) plus a
 * strictly isolated device-local guest store (`forte-local-guest`, v1).
 *
 * - `forte-offline`: belongs to at most one signed-in cloud account. Signing
 *   out or switching accounts vaults unsynced pending changes into
 *   `forte-pending:<userId>` before clearing `forte-offline` and private route
 *   caches. Re-signing into that same account restores its pending items.
 * - `forte-local-guest`: holds training data created on this device before
 *   sign-in (including workouts migrated from the previous RC's Quick local
 *   workout form). Cloud accounts never automatically read or upload guest
 *   data — the user explicitly chooses whether to associate it with an account.
 */

const DB_NAME = "forte-offline";
const DB_VERSION = 3;
const GUEST_DB_NAME = "forte-local-guest";
const GUEST_DB_VERSION = 1;
const PENDING_VAULT_PREFIX = "forte-pending:";
const PENDING_VAULT_VERSION = 2;

const PRIVATE_CACHE_PREFIX = "forte-private-";
const CLEAR_PRIVATE_CACHE_MESSAGE = "clear-private-cache";
const CACHE_PRIVATE_ROUTE_MESSAGE = "cache-private-route";
const WARM_OFFLINE_SHELL_MESSAGE = "warm-offline-shell";

const WORKOUTS = "workouts";
const PENDING = "pending";
const META = "meta";
const ROUTINES = "routines";
const PENDING_ROUTINES = "pending_routines";
const FOLDERS = "folders";
const PENDING_FOLDERS = "pending_folders";
const CATALOG = "catalog";

const OWNER_KEY = "owner_id";
const SYNCED_KEY = "last_synced_at";
const CATALOG_KEY = "snapshot";

const STORE_NAMES = [
  WORKOUTS,
  PENDING,
  META,
  ROUTINES,
  PENDING_ROUTINES,
  FOLDERS,
  PENDING_FOLDERS,
  CATALOG,
];
const VAULT_STORE_NAMES = [WORKOUTS, ROUTINES, PENDING_ROUTINES, FOLDERS, PENDING_FOLDERS, META];

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
  media_url?: string | null;
  duration_record_direction?: DurationRecordDirection;
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
  templateSlugs?: Record<string, string>;
  updatedAt: string;
}

export interface PendingFolderEntry {
  id: string;
  op: "upsert" | "delete";
  input?: RoutineFolderInput;
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
  listFolders(): Promise<RoutineFolder[]>;
  writeFolder(folder: RoutineFolder): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  markFolderPending(entry: PendingFolderEntry): Promise<void>;
  clearFolderPending(folderId: string): Promise<void>;
  pendingFolders(): Promise<PendingFolderEntry[]>;
  readCatalog(): Promise<OfflineCatalogSnapshot | undefined>;
  writeCatalog(snapshot: OfflineCatalogSnapshot): Promise<void>;
  lastSyncedAt(): Promise<string | null>;
  setLastSyncedAt(iso: string): Promise<void>;
  clear(): Promise<void>;
}

let connection: Promise<IDBDatabase> | null = null;
let guestConnection: Promise<IDBDatabase> | null = null;
let ownerGate: Promise<unknown> = Promise.resolve();
let storeEpoch = 0;

/**
 * Monotonic generation counter incremented on sign-out, account deletion, and
 * account switch so in-flight background refreshes cannot write stale records
 * back into `forte-offline` after cleanup.
 */
export function getOfflineStoreEpoch(): number {
  return storeEpoch;
}

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

function openNamedDatabase(name: string, version: number, stores: string[]): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  let request: IDBOpenDBRequest;
  try {
    request = indexedDB.open(name, version);
  } catch (error) {
    return Promise.reject(error);
  }

  request.onupgradeneeded = () => {
    const db = request.result;
    for (const storeName of stores) {
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error(`Failed to open ${name}.`));
  request.onblocked = () =>
    reject(new Error(`IndexedDB ${name} is blocked by another open connection.`));

  return promise;
}

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  const promise = openNamedDatabase(DB_NAME, DB_VERSION, STORE_NAMES).then((db) => {
    db.onversionchange = () => {
      db.close();
      if (connection === promise) connection = null;
    };
    return db;
  });
  promise.catch(() => {
    if (connection === promise) connection = null;
  });
  connection = promise;
  return promise;
}

function openGuestDatabase(): Promise<IDBDatabase> {
  if (guestConnection) return guestConnection;
  const promise = openNamedDatabase(GUEST_DB_NAME, GUEST_DB_VERSION, STORE_NAMES).then(
    async (db) => {
      db.onversionchange = () => {
        db.close();
        if (guestConnection === promise) guestConnection = null;
      };
      await transact(db, [META], "readwrite", async (tx) => {
        const existing = await fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY));
        if (!existing) {
          await fromRequest(tx.objectStore(META).put(LOCAL_GUEST_OWNER, OWNER_KEY));
        }
      });
      return db;
    },
  );
  promise.catch(() => {
    if (guestConnection === promise) guestConnection = null;
  });
  guestConnection = promise;
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
  return openNamedDatabase(vaultDbName(userId), PENDING_VAULT_VERSION, VAULT_STORE_NAMES);
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
  folders: RoutineFolder[];
  pendingFolders: PendingFolderEntry[];
}

async function readPendingBundleFromActive(db: IDBDatabase): Promise<PendingBundle> {
  return transact(
    db,
    [META, WORKOUTS, PENDING, ROUTINES, PENDING_ROUTINES, FOLDERS, PENDING_FOLDERS],
    "readonly",
    async (tx) => {
      const owner =
        (await fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY))) ?? null;
      const pendingWorkoutKeys = (await fromRequest(tx.objectStore(PENDING).getAllKeys())).map(
        String,
      );
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
        const doc = await fromRequest<RoutineTree | undefined>(
          tx.objectStore(ROUTINES).get(entry.id),
        );
        if (doc) routines.push(doc);
      }
      const pendingFolders = await fromRequest<PendingFolderEntry[]>(
        tx.objectStore(PENDING_FOLDERS).getAll(),
      );
      const folders: RoutineFolder[] = [];
      for (const entry of pendingFolders) {
        const doc = await fromRequest<RoutineFolder | undefined>(
          tx.objectStore(FOLDERS).get(entry.id),
        );
        if (doc) folders.push(doc);
      }
      return { ownerId: owner, workouts, routines, pendingRoutines, folders, pendingFolders };
    },
  );
}

/**
 * Durably copies an account's unsynced workouts, routines, and folders into a
 * per-account IndexedDB vault (`forte-pending:<userId>`) so signing out or
 * switching accounts never silently discards pending work while keeping it
 * invisible to signed-out users and every other account.
 */
async function stashPendingToVault(activeDb: IDBDatabase, ownerId: string): Promise<void> {
  if (!ownerId || ownerId === LOCAL_GUEST_OWNER) return;
  const bundle = await readPendingBundleFromActive(activeDb);
  if (bundle.ownerId !== ownerId) return;
  if (
    bundle.workouts.length === 0 &&
    bundle.pendingRoutines.length === 0 &&
    bundle.pendingFolders.length === 0
  ) {
    return;
  }

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
      const fStore = tx.objectStore(FOLDERS);
      for (const folder of bundle.folders) {
        await fromRequest(fStore.put(folder, folder.id));
      }
      const pfStore = tx.objectStore(PENDING_FOLDERS);
      for (const entry of bundle.pendingFolders) {
        await fromRequest(pfStore.put(entry, entry.id));
      }
    });
  } finally {
    vaultDb.close();
  }
}

/**
 * Restores any privately vaulted unsynced workouts/routines/folders for
 * `userId` into the active store, then removes the vault only after commit.
 */
async function restorePendingFromVault(activeDb: IDBDatabase, userId: string): Promise<void> {
  if (!userId || userId === LOCAL_GUEST_OWNER) return;
  if (!(await vaultMayExist(userId))) return;

  const vaultDb = await openVaultDatabase(userId);
  let vaultedWorkouts: LoggedWorkout[] = [];
  let vaultedRoutines: RoutineTree[] = [];
  let vaultedPendingRoutines: PendingRoutineEntry[] = [];
  let vaultedFolders: RoutineFolder[] = [];
  let vaultedPendingFolders: PendingFolderEntry[] = [];
  let vaultOwner: string | undefined;
  try {
    const readResult = await transact(vaultDb, VAULT_STORE_NAMES, "readonly", async (tx) => {
      const owner = await fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY));
      const workouts = await fromRequest<LoggedWorkout[]>(tx.objectStore(WORKOUTS).getAll());
      const routines = await fromRequest<RoutineTree[]>(tx.objectStore(ROUTINES).getAll());
      const pendingRoutines = await fromRequest<PendingRoutineEntry[]>(
        tx.objectStore(PENDING_ROUTINES).getAll(),
      );
      const folders = await fromRequest<RoutineFolder[]>(tx.objectStore(FOLDERS).getAll());
      const pendingFolders = await fromRequest<PendingFolderEntry[]>(
        tx.objectStore(PENDING_FOLDERS).getAll(),
      );
      return { owner, workouts, routines, pendingRoutines, folders, pendingFolders };
    });
    vaultOwner = readResult.owner;
    vaultedWorkouts = readResult.workouts;
    vaultedRoutines = readResult.routines;
    vaultedPendingRoutines = readResult.pendingRoutines;
    vaultedFolders = readResult.folders;
    vaultedPendingFolders = readResult.pendingFolders;
  } finally {
    vaultDb.close();
  }

  if (
    vaultOwner === userId &&
    (vaultedWorkouts.length > 0 ||
      vaultedPendingRoutines.length > 0 ||
      vaultedPendingFolders.length > 0)
  ) {
    await transact(
      activeDb,
      [WORKOUTS, PENDING, ROUTINES, PENDING_ROUTINES, FOLDERS, PENDING_FOLDERS],
      "readwrite",
      async (tx) => {
        const wStore = tx.objectStore(WORKOUTS);
        const pStore = tx.objectStore(PENDING);
        for (const workout of vaultedWorkouts) {
          const alreadyPending = await fromRequest<string | undefined>(pStore.get(workout.id));
          if (!alreadyPending) {
            await fromRequest(pStore.put(workout.id, workout.id));
            await fromRequest(wStore.put(workout, workout.id));
          }
        }
        const fStore = tx.objectStore(FOLDERS);
        const pfStore = tx.objectStore(PENDING_FOLDERS);
        const folderById = new Map(vaultedFolders.map((f) => [f.id, f]));
        for (const entry of vaultedPendingFolders) {
          const alreadyPending = await fromRequest<PendingFolderEntry | undefined>(
            pfStore.get(entry.id),
          );
          if (!alreadyPending) {
            await fromRequest(pfStore.put(entry, entry.id));
            const doc = folderById.get(entry.id);
            if (doc) await fromRequest(fStore.put(doc, doc.id));
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
      },
    );
  }

  await deleteVaultDatabase(userId).catch(() => {});
}

async function claimOwner(db: IDBDatabase, userId: string): Promise<boolean> {
  const currentOwner = await transact(db, [META], "readonly", async (tx) =>
    fromRequest<string | undefined>(tx.objectStore(META).get(OWNER_KEY)),
  );

  let ownerChanged = false;
  if (currentOwner !== userId) {
    storeEpoch += 1;
    if (currentOwner !== undefined && currentOwner !== LOCAL_GUEST_OWNER) {
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
    storeEpoch += 1;
    ownerChanged = true;
  }

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
        return items.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
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

    listFolders: () =>
      read([FOLDERS], async (tx) => {
        const items = await fromRequest<RoutineFolder[]>(tx.objectStore(FOLDERS).getAll());
        return items.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
      }),

    writeFolder: (folder) =>
      write([FOLDERS], (tx) => fromRequest(tx.objectStore(FOLDERS).put(folder, folder.id))),

    deleteFolder: (folderId) =>
      write([FOLDERS], (tx) => fromRequest(tx.objectStore(FOLDERS).delete(folderId))),

    markFolderPending: (entry) =>
      write([PENDING_FOLDERS], (tx) =>
        fromRequest(tx.objectStore(PENDING_FOLDERS).put(entry, entry.id)),
      ),

    clearFolderPending: (folderId) =>
      write([PENDING_FOLDERS], (tx) =>
        fromRequest(tx.objectStore(PENDING_FOLDERS).delete(folderId)),
      ),

    pendingFolders: () =>
      read([PENDING_FOLDERS], (tx) =>
        fromRequest<PendingFolderEntry[]>(tx.objectStore(PENDING_FOLDERS).getAll()),
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
  storeEpoch += 1;
  const discardPending = options?.discardPending ?? false;
  const operations: Promise<unknown>[] = [clearPrivateRouteCaches()];
  if (typeof indexedDB !== "undefined") {
    operations.push(
      openDatabase().then((db) =>
        serialized(async () => {
          storeEpoch += 1;
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
          storeEpoch += 1;
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
    const [pendingWorkouts, pendingRoutines, pendingFolders] = await Promise.all([
      existing.store.pendingWorkoutIds(),
      existing.store.pendingRoutines(),
      existing.store.pendingFolders(),
    ]);
    return pendingWorkouts.length + pendingRoutines.length + pendingFolders.length;
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
 * (`/offline-app`), built-in catalogue, body-heatmap artwork, and public
 * exercise thumbnails so PWA cold launches work in airplane mode.
 */
export function warmOfflineShell(thumbnailSlugs: string[] = []): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const thumbnails = [...new Set(thumbnailSlugs)]
    .filter(Boolean)
    .slice(0, 450)
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

/**
 * Opens the isolated device-local guest store (`forte-local-guest`). Never
 * modifies or reads any cloud account's `forte-offline` or pending vaults.
 */
export async function openLocalGuestStore(): Promise<OfflineStore> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline logging needs IndexedDB, which this browser does not provide.");
  }
  const db = await openGuestDatabase();
  return createStore(db);
}

export async function openOfflineStore(userId: string): Promise<OfflineStore> {
  if (userId === LOCAL_GUEST_OWNER) {
    return openLocalGuestStore();
  }
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline logging needs IndexedDB, which this browser does not provide.");
  }
  const db = await openDatabase();
  const ownerChanged = await serialized(() => claimOwner(db, userId));
  if (ownerChanged) await clearPrivateRouteCaches();
  return createStore(db);
}

/**
 * Opens the existing cloud-account store during an offline cold start when no
 * server session check is possible. Returns `null` if no cloud account has
 * claimed the device yet (fresh install or after sign-out).
 */
export async function openExistingOfflineStore(): Promise<{
  ownerId: string;
  store: OfflineStore;
} | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDatabase();
  const store = createStore(db);
  const owner = await store.ownerId();
  if (!owner || owner === LOCAL_GUEST_OWNER) return null;
  return { ownerId: owner, store };
}

export async function prepareOfflineDataForUser(userId: string): Promise<void> {
  await clearPrivateRouteCaches();
  await openOfflineStore(userId);
}
