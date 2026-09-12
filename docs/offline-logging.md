# Offline logging — design

Design for logging a workout with no network. Written before implementation, and
deliberately narrow: the goal is that a session already under way survives losing
signal, not that the whole app works offline.

## The envelope: what is offline-capable, and what is not

| Surface | Offline | Why |
|---|---|---|
| Log a set (reps, weight, RPE) | **yes** | The core need: you are mid-set in a basement. |
| Add / remove / undo a set | **yes** | Same screen, same need. |
| Finish the workout | **yes** | Sessions end where they happened. |
| Rest timer, elapsed timer | **already yes** | Both are client-side already; they keep running with no network and need no work. |
| View the current workout | **yes** | Loaded from the local store, not the network. |
| Start a workout from a routine | **no** | Needs a session and a routine. Starting happens at a door, desk or sofa far more often than mid-set. |
| History, progress, routines, exercises, account | **no** | All read surfaces; they degrade to the browser's offline page. |

Cold/reload matters: opening the current logger with no signal must not produce
the browser's generic error. The service worker therefore runtime-snapshots that
exact route after it has been opened online — see below.

## The central decision: sync the document, not a log of operations

Two ways to get local edits to the server:

1. **An operation log** — queue "log set X", "remove set Y", replay in order.
2. **Whole-document reconciliation** — the client owns the active workout's state
   and sends the desired state; the server makes the database match.

**This design takes the second.** For one user editing one active workout, the
document is small (tens of sets), and reconciliation is idempotent and
order-independent by construction. An operation log has to get replay ordering,
partial application and duplicate suppression right, and each of those is a
correctness hazard that shows up as a duplicated or vanished set — the exact
failure this feature must not have.

The consequence is a real tradeoff, stated plainly: **the last device to sync
wins.** Two devices logging the same workout simultaneously will lose one
device's edits. That is acceptable for a gym logger and much cheaper than merge
logic, but it is a decision, not an accident.

## Local store

IndexedDB, one database per origin, hand-written (no new dependency):

- `workouts` — the active workout document: exercises, sets, rest targets, title.
  Keyed by workout id.
- `pending` — workout ids with unsynced local changes, plus the timestamp of the
  last successful sync. A set of ids rather than a queue: syncing the document is
  idempotent, so coalescing repeated edits is correct and a partial flush is
  simply retried.
- `meta` — the signed-in user id, and when the store was last synced.

**Scoped and cleared by user.** The `meta` store records the owner id. Opening
for a different owner clears every local workout before returning a store, and
sign-out or account deletion clears the store explicitly. The private route
cache follows the same lifecycle. Without both, the next person to use the
device could see the previous user's training — the worst failure this feature
can have. Rendering also refuses a pending document whose last successful sync
is older than 7 days.

## Server changes

Small, and confined to the active-workout path.

1. **Client-generated ids for sets.** `addSet` currently lets the database mint
   the id, which makes an offline-created set impossible to reference. Sets will
   be created with a `crypto.randomUUID()` from the client, so the same set
   replayed is the same row. `workout_set.id` already defaults to
   `gen_random_uuid()`; accepting an explicit id is additive.
2. **One reconciliation action**: `syncWorkoutState(workoutId, document)`.
   Owner- and active-checked like every existing action, applied in one
   transaction: upsert present sets, delete absent ones, update values,
   `completed_at`. The ownership predicate stays in the same place it is today —
   `requireSessionUserId()`, never a caller-supplied user id.
3. **`ended_at` from the client** when finishing offline, validated to be a real
   timestamp within the workout's own span. Otherwise a finished-while-offline
   workout would be stamped at sync time and report the wrong duration.

Everything else — `routines`, `history`, `progress` — is untouched.

## Service worker

Hand-written, no dependency, registered from the root layout.

**Narrow runtime cache, not a build-time precache.** The worker has two cache
families with different trust:

- **Shared static cache:** immutable `/_next/static/*` chunks and generated PWA
  metadata. These contain no account data and survive account changes.
- **Private route cache:** the exact `/workouts/[id]` HTML after the active
  `WorkoutLogger` has claimed its IndexedDB owner and explicitly asked the worker
  to retain that URL. Merely viewing a completed workout does not cache it.
  Sign-out, account deletion, and a different IndexedDB owner delete every
  private cache.

Every navigation is network-first. Only an exact workout route can fall back to
its private snapshot; every other failed navigation gets the offline page.
Authenticated history, progress, routines, exercises and account pages are never
restored from cache. Non-navigation GETs are intercepted only for the explicit
static allowlist, which excludes Next RSC and prefetch responses even though they
use GET and carry personalized data.

The worker never intercepts `/api/*`, POSTs, cross-origin traffic, or range
requests. Writes remain the reconciliation action's job; a worker that queued
them would be a second, conflicting outbox.

An epoch invalidates a private response that began before sign-out but completed
after cleanup, so an in-flight fetch cannot recreate the deleted cache. Activating
this policy also deletes the earlier broad `forte-v2` cache immediately.

The honest envelope remains: offline works after the current workout and its
assets have been opened online. A fresh install with no network cannot cold start.
The CDN must not pretend otherwise by serving a cached authenticated shell.

## Client data flow on the logging page

The page keeps its server-rendered first paint, then hands over:

1. Server component loads the workout as it does today and passes it as the
   initial document.
2. A client provider writes it to IndexedDB, then renders **from the store**, not
   from props. Mutations update the store synchronously and queue a sync.
3. Sync runs on: an `online` event, a visibility change, a debounced interval
   after edits, and on load when the outbox is non-empty.
4. Each set shows its own pending state, so "saved" is never shown for something
   the server has not accepted.

## Failure handling

- A failed sync retries with backoff and never drops a local change.
- A rejection the server will never accept (`not_active`, `not_authorized` — the
  workout was finished on another device) surfaces a clear message with the local
  changes kept and an offer to copy them out. Silently discarding a logged set is
  the one outcome that is not allowed.
- The UI shows unsynced-change count whenever it is non-zero.

## Testing

- **Reconciliation purity**: the diff (local document → set upserts/deletes) is a
  pure function and gets unit checks in the existing suite style, on PGlite and
  PostgreSQL.
- **Idempotency**: applying the same document twice leaves the database
  identical — the property the whole design rests on.
- **Ownership**: another user's workout cannot be synced or read through the
  store's code paths.
- **Store and cache scoping:** sign-out clears IndexedDB and private route
  snapshots; a different user id cannot read the previous user's records.
- **Service-worker policy:** `bun run verify:service-worker` executes the worker
  against observable requests and verifies the static/private split, RSC
  exclusion, cleanup, exact-route fallback, and the sign-out race.
- **Offline in a real browser:** load the logging page, go offline, log sets,
  confirm they persist locally and survive a reload, go online, confirm they
  reach the database and the pending indicator clears. Then change accounts and
  confirm the new account sees neither the prior IndexedDB document nor its
  private route snapshot.

## Explicit non-goals

- Offline start, history, progress, routines or account.
- Background Sync API and push — not needed, and patchy across browsers.
- Multi-device merge. Last writer wins, as stated above.
- Offline auth. The session is not verifiable offline; the cached store is
  trusted for its 7-day window and cleared on sign-out.
- Caching the RSC payloads for arbitrary routes. Fragile and unnecessary: the
  offline surface renders from IndexedDB.

## Decisions

1. **Envelope — the full one.** Log, add/remove/undo, *and* finish offline, with
   the shell cached so the app opens with no signal. The accepted consequence is
   the one above: offline works only after the app has been opened once.
2. **Conflict policy — last write wins.** A second device editing the same active
   workout can have its edit overwritten by whichever syncs last. Accepted for a
   single-user gym logger; the alternative was refusal-to-overwrite, judged not
   worth the extra failure mode.

## Build sequence

Ordered so each phase lands working on its own — an interruption leaves a
functioning app rather than a half-migrated one.

1. **Local store.** IndexedDB wrapper: open, user-scoped reads and writes, clear
   on sign-out. Unit checks in the existing suite style. No UI change.
2. **Reconciliation.** Client-generated set ids, the `syncWorkoutState` action,
   and the pure diff from local document to upserts and deletes. Suite checks on
   idempotency and ownership — applying the same document twice must leave the
   database identical. Still no UI change.
3. **The logging page reads from the store.** Hydrate from the server render,
   write through to IndexedDB, render from the store, queue and flush syncs.
   Online behaviour is unchanged, and this is the phase that must not regress
   normal logging.
4. **Service worker.** Runtime caching, registration, offline fallback, and the
   `DEPLOYMENT.md` rewrite that goes with reversing the no-worker decision.
5. **Offline UX.** Pending-change indicator, per-set state, retry with backoff,
   the hard-failure path that keeps local changes rather than discarding them,
   and the staleness refusal.
6. **Acceptance test in a real browser.** Offline mode, log sets, reload while
   offline, reconnect, confirm the database matches and the indicator clears.
