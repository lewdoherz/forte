import type { WorkoutTree } from "@/schema/types";

/**
 * Offline store for the active workout document.
 *
 * One IndexedDB database per origin, written by hand because the feature does
 * not justify a dependency. The database belongs to exactly one user: the owner
 * id is recorded in `meta` when the store is opened, and opening for a
 * different user clears the previous user's records rather than serving them.
 * Without that, the next person on the device would see someone else's training
 * — the worst failure this feature can have.
 *
 * IndexedDB stores structured clones, so `Date` fields survive the round trip
 * as `Date`; there is no serialisation layer here.
 */

const DB_NAME = "forte-offline";
const DB_VERSION = 1;

/** The active workout documents, keyed by workout id. */
const WORKOUTS = "workouts";
/** Workout ids with unsynced local changes; presence means pending. */
const PENDING = "pending";
/** Single-user bookkeeping: the owning user id and the last sync timestamp. */
const META = "meta";

const OWNER_KEY = "owner_id";
const SYNCED_KEY = "last_synced_at";

const STORE_NAMES = [WORKOUTS, PENDING, META];

export interface OfflineStore {
  readWorkout(workoutId: string): Promise<WorkoutTree | undefined>;
  writeWorkout(workout: WorkoutTree): Promise<void>;
  deleteWorkout(workoutId: string): Promise<void>;
  markPending(workoutId: string): Promise<void>;
  clearPending(workoutId: string): Promise<void>;
  pendingWorkoutIds(): Promise<string[]>;
  lastSyncedAt(): Promise<string | null>;
  setLastSyncedAt(iso: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * The one cached connection. Opening is idempotent because a page with several
 * call sites would otherwise hold several connections, which also blocks
 * version upgrades until every tab closes.
 */
let connection: Promise<IDBDatabase> | null = null;
/**
 * Serialises ownership checks, so two concurrent opens cannot interleave a read
 * of the owner with another call's clear.
 */
let ownerGate: Promise<unknown> = Promise.resolve();

/** Promisifies a single request; transaction completion is handled separately. */
function fromRequest<T>(request: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  return promise;
}

/**
 * Runs `run` inside one transaction and resolves when that transaction commits,
 * not merely when its last request succeeds. Rejection aborts the transaction so
 * a partial write is never committed.
 */
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
    // A connection closed by a version change throws here rather than firing an
    // event; reject so callers still get a promise.
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
          // The transaction had already finished; nothing left to abort.
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
    // Version upgrades create only what is missing, so a future version can add
    // a store without dropping existing records.
    const db = request.result;
    for (const name of STORE_NAMES) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    }
  };

  request.onsuccess = () => {
    const db = request.result;
    // Another tab upgrading the schema cannot proceed while this connection is
    // open, so close it and let the next call reopen at the new version.
    db.onversionchange = () => {
      db.close();
      if (connection === promise) connection = null;
    };
    resolve(db);
  };

  request.onerror = () =>
    reject(request.error ?? new Error("Failed to open the offline database."));
  // An upgrade blocked by another connection would otherwise hang forever.
  request.onblocked = () =>
    reject(new Error("The offline database is blocked by another open connection."));

  // Drop a failed open so a later call retries instead of replaying the rejection.
  promise.catch(() => {
    if (connection === promise) connection = null;
  });
  connection = promise;
  return promise;
}

/** Chains `task` after any in-flight ownership check. */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  // Run whether the previous check settled or failed: one failed open must not
  // wedge every later call.
  const next = ownerGate.then(task, task);
  ownerGate = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Records `userId` as the database owner, clearing the records when a different
 * user was stored. Clearing is the only safe answer to a mismatch: the previous
 * user's workout would otherwise be unreachable but still on disk.
 */
async function claimOwner(db: IDBDatabase, userId: string): Promise<void> {
  await transact(db, STORE_NAMES, "readwrite", async (tx) => {
    const meta = tx.objectStore(META);
    const owner = await fromRequest<string | undefined>(meta.get(OWNER_KEY));
    if (owner === userId) return;

    if (owner !== undefined) {
      await fromRequest(tx.objectStore(WORKOUTS).clear());
      await fromRequest(tx.objectStore(PENDING).clear());
      await fromRequest(meta.clear());
    }
    await fromRequest(meta.put(userId, OWNER_KEY));
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
    readWorkout: (workoutId) =>
      read([WORKOUTS], (tx) =>
        fromRequest<WorkoutTree | undefined>(tx.objectStore(WORKOUTS).get(workoutId)),
      ),

    writeWorkout: (workout) =>
      write([WORKOUTS], (tx) => fromRequest(tx.objectStore(WORKOUTS).put(workout, workout.id))),

    deleteWorkout: (workoutId) =>
      // A pending id whose document is gone is a dangling pointer, so both go.
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

    lastSyncedAt: () =>
      read([META], async (tx) => {
        const value = await fromRequest<string | undefined>(tx.objectStore(META).get(SYNCED_KEY));
        return value ?? null;
      }),

    setLastSyncedAt: (iso) =>
      write([META], (tx) => fromRequest(tx.objectStore(META).put(iso, SYNCED_KEY))),

    clear: () =>
      // The sign-out path: the owner id goes with everything it owns, so the
      // next sign-in begins from an empty store.
      write(STORE_NAMES, async (tx) => {
        await fromRequest(tx.objectStore(WORKOUTS).clear());
        await fromRequest(tx.objectStore(PENDING).clear());
        await fromRequest(tx.objectStore(META).clear());
      }),
  };
}

/**
 * Opens the store scoped to `userId`, clearing any records left by a different
 * user. Safe to call repeatedly: the connection is cached and ownership is
 * re-checked, so a sign-out followed by a different sign-in on the same page
 * cannot expose the earlier user's workout.
 */
export async function openOfflineStore(userId: string): Promise<OfflineStore> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline logging needs IndexedDB, which this browser does not provide.");
  }
  const db = await openDatabase();
  await serialized(() => claimOwner(db, userId));
  return createStore(db);
}
