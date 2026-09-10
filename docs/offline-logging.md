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

Cold start matters: without a service worker, opening the app in the gym with no
signal loads nothing, and the feature is pointless. So the shell is precached —
see below.

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
- `outbox` — workout ids with unsynced local changes, plus the timestamp of the
  last successful sync. A set of ids rather than a queue: syncing the document is
  idempotent, so coalescing repeated edits is correct and a partial flush is
  simply retried.
- `meta` — the signed-in user id, and when the store was last synced.

**Scoped and cleared by user.** Every record carries the owning user id, and the
store is cleared on sign-out. Without that, the next person to use the device
sees the previous user's training — the worst failure this feature can have.
Rendering also refuses if the last sync is older than 7 days, so a device left
signed in cannot serve an indefinitely stale session.

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

**Runtime cache, not a build-time precache.** `/workouts/[id]` is a dynamic route
— its HTML is generated per request, and the JS chunks are content-hashed — so
there is nothing meaningful to enumerate at install time. The worker instead
caches same-origin GETs as they are fetched, cache-first, with a network fallback
for navigations.

That sets the honest envelope: **offline works once the app has been opened
once.** Which matches the use — open it at home or on the way, and it keeps
working in the basement. A freshly installed app with no network will not open,
and no worker can change that.

- **Cache-first** for same-origin GETs (the shell, its chunks, icons), populated
  at runtime, versioned by a constant bumped each deploy.
- **Never intercept** `/api/*` or POSTs. Writes are the reconciliation action's
  job; a worker that queued requests would be a second, conflicting outbox.
- **Offline fallback**: for a same-origin navigation with nothing cached, a page
  saying the app is offline and what still works.

This reverses a deliberate earlier decision — `DEPLOYMENT.md` currently states
there is no service worker on purpose and that a CDN must not serve the shell as
if it were offline-capable. That paragraph gets rewritten in the same change, and
the "do not configure a CDN to serve the shell" warning stays: a worker that owns
the shell is different from a cache that pretends the network is up.

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
- **Store scoping**: sign-out clears the store; a different user id cannot read
  the previous user's records.
- **Offline in a real browser**: Puppeteer's `page.setOfflineMode(true)` against
  the dev server — load the logging page, go offline, log sets, confirm they
  persist locally and survive a reload, go online, confirm they reach the
  database and the pending indicator clears. This is the acceptance test.

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
