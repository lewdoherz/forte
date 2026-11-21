# forte

[![CI](https://github.com/lewdoherz/forte/actions/workflows/ci.yml/badge.svg)](https://github.com/lewdoherz/forte/actions/workflows/ci.yml)

A web-based workout tracker inspired by different existent trackers: authentication, an exercise library,
reusable routine templates, an active workout logger, workout history, and progress
analytics with personal records.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Auth | Better Auth (independent email/password; readiness-gated Google, Apple, Facebook and LinkedIn) |
| Query layer | Kysely (type-safe SQL query builder — **no ORM**) |
| Database (dev) | PGlite (PostgreSQL compiled to WASM) |
| Database (prod) | PostgreSQL |
| Schema authority | Hand-written SQL migrations (`schema/migrations`) |
| Validation | Zod |
| Runtime / packages | Bun |

## Architecture

- **Raw SQL is the schema authority.** `schema/migrations/NNNN_*.sql` are applied by
  `scripts/migrate.ts` (tracked in `schema_migrations`). No ORM owns the schema.
- **Kysely is the query layer only.** The application and Better Auth share a single
  Kysely instance (`lib/db.ts`); the dialect is PGlite locally and `pg` in production.
- **Single user identity.** Better Auth maps onto `app_user` (`user.id === app_user.id`),
  so the session user id is directly usable as `owner_id` everywhere.
- **Routines and workouts are separate.** A routine is a reusable template; starting a
  workout snapshots the routine into `workout` / `workout_exercise` / `workout_set`.
  Editing a routine never changes a started workout, and completed workouts are immutable.
  The snapshot carries everything the logger needs at log time — including the rest
  target (`workout_exercise.rest_seconds`) and superset grouping — so neither is ever
  read back through `routine_id`.
- **Analytics are canonical, derived, and aggregated in SQL.** Statistics and
  personal records use completed sets from finished workouts, with one type-aware
  metric policy. Nothing is stored as an authoritative aggregate, and result sizes
  stay bounded by sessions rather than growing with every set.
- **Failures are visible.** Route-level `error`/`loading`/`not-found` boundaries render
  inside the shell so navigation survives a failure, and the reference they show is the
  same `digest` recorded server-side by `onRequestError` (instrumentation.ts) through
  `lib/log.ts`. Server actions no longer swallow unexpected failures; expected
  outcomes (an ownership check, a stale page) are filtered out so real ones are not
  buried. The log never carries error messages, which can embed SQL, parameters or
  connection strings.
- **Authentication is rate limited, and the limits are persisted.** Better Auth rate
  limits in production; its store is moved to the database (`rate_limit`, migration
  0009) so limits survive a deploy and are shared between instances, and the password
  endpoints carry their own rules instead of the global traffic allowance. The client
  IP is read from forwarded headers, so the topology has to be **declared** with
  exactly one of: `TRUSTED_PROXY_CIDRS` (a proxy that appends `X-Forwarded-For` — the
  chain is stripped to the first untrusted hop) or `TRUST_FORWARDED_HEADER=true` (a
  platform that sets the header itself and does not forward client-supplied values,
  which is what Vercel documents). Getting it wrong is silent either way: without
  trusted proxy addresses a single-value header is accepted from any caller, so a
  client can rotate the value and never be limited; and a multi-hop chain is refused
  outright, so every caller shares one bucket and one abusive client can lock everyone
  out. The server warns at startup only when neither is declared.
- **Sessions are visible and revocable.** `/account` lists the devices that can reach
  the account and can end any of them, through Better Auth's own session APIs rather
  than direct SQL.
- **Provider access is opt-in and explicitly linked.** Google is the primary social
  option; Apple, Facebook and LinkedIn use Better Auth's built-in providers.
  Credentials alone do not expose a button: each provider also needs its verified
  readiness flag. Matching emails never merge users. Linking requires an existing
  authenticated account and provider proof; provider subjects preserve that same
  account on every platform. Missing-email identities can verify a contact address,
  then enroll an independent password through recovery. See
  [provider setup and retirement safety](DEPLOYMENT.md#social-sign-in-and-account-linking).
- **Three mobile destinations.** Home retains recent activity/history; `/workout`
  owns start/resume and routine choice; `/profile` links progress, the library and
  account settings. Desktop keeps secondary routes in a width-appropriate sidebar.
  The active logger owns the whole screen and minimizes without discarding its
  draft. Completed details retain ordinary navigation and a compact resume entry.
  Safe-area insets protect the sticky Finish header and the independent rest dock.
- **Offline active workouts are account-isolated.** The logger writes its active
  document to an owner-scoped IndexedDB store and reconciles it when connectivity
  returns. The service worker caches immutable build assets plus the exact active
  workout route in a separate private cache; it never caches arbitrary authenticated
  pages or Next RSC payloads. Sign-out, account deletion and an account change purge
  both private stores.
- **PWA icons are generated, not assets.** `next/og` renders a neutral monogram
  (`components/forte-mark.tsx`) into PNGs at request/build time, so no binary image
  files are checked in.
- **Configuration is validated in one place.** `lib/env.ts` is the single source of
  truth (zod). Development stays zero-config; a production server refuses to start
  without `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`
  (`assertProductionEnv()`, called from `instrumentation.ts`). The `next build`
  phase is deliberately exempt so builds do not need runtime secrets.
- **Calendar bucketing uses the user's stored timezone.** Instants are absolute
  (`timestamptz`); every conversion into a calendar concept — a day boundary, a
  range lower bound, a rendered date — goes through `lib/timezone.ts` using
  `app_user.timezone`. The zone is a stored preference, never inferred per request
  from the browser, so analytics bucketing is stable and server-computable.
- **Action-first dashboard.** Resume or start a workout, choose a routine, see
  seven local calendar days of finished sessions, and open recent workouts or PRs.
  Weekly totals use finish-time filtering and complete pagination, including
  sessions that started before the window. Counts, volume, and records reuse
  the canonical history and Records calculations; no goals or streaks are invented.
- **Two languages, resolved on the server.** The interface ships in English and
  Simplified Chinese. The choice lives in the `forte_locale` cookie (rendering,
  including the signed-out pages, so a reader can switch before signing in) and in
  `app_user.locale` (outgoing email, sent from a background task where no cookie
  exists). Messages are typed flat dictionaries in `lib/i18n/dictionaries/`; the
  Chinese set is checked against the English keys at compile time, so a missing
  translation fails the build rather than falling back silently. Dates, numbers
  and durations are formatted per locale, and catalog content — exercise titles,
  instructions, muscle groups, equipment — is stored per language with English as
  the authority and the fallback.


## Progress

| Step | Feature | State |
|---|---|---|
| 1 | Next.js + Tailwind + folder scaffold | done |
| 2–3 | Data layer: raw SQL + PGlite/Postgres (Prisma removed) | done |
| 4 | Auth infrastructure: Better Auth + Kysely + `0004_auth.sql` | done |
| 5 | Auth UX + protected `(app)` boundary (sign-in / sign-up / sign-out / session helper) | done |
| 6 | Exercise library (`/exercises`, detail, custom exercise CRUD) | done |
| 7 | Routines / workout templates (`/routines`, editor, ordered exercises + planned sets) | done |
| 8 | Active workout logger (`/workouts/[id]`, set logging, completion, finish) | done |
| 9 | Workout history (`/workouts` list + read-only completed detail) | done |
| 10 | Type-aware progress analytics and PRs (exercise Statistics, canonical e1RM, charts) | done |
| 11 | Mobile-first shell (bottom nav, safe areas, touch targets) + installable PWA (manifest, generated icons) | done |
| 12 | Production readiness: validated env, secret hardening, timezone-aware analytics, account settings, PostgreSQL path verified | done |
| 13 | Operability: CI, failure boundaries, structured logging, opt-in dev seed, SQL-aggregated analytics | done |
| 14 | Logger depth: snapshotted rest target with a rest timer, and superset grouping | done |
| 15 | Auth hardening: database-backed rate limiting with per-endpoint rules, and session management | done |
| 16 | First production deployment and Vercel/Neon verification | done |
| Post-16 | Account lifecycle, offline logging, routine sharing, workout summaries, PRs, and exercise tabs | done |
| 17 | Localization: English and Simplified Chinese, in-app language switcher, translated catalog and vocabulary, per-account email language | done |

## Android, iPhone, and iPad

The web app remains installable from supported browsers. Native hosted clients
also live in [`mobile/`](mobile/README.md):

| Platform | Implementation | Personal installation |
|---|---|---|
| Android 11+ | Java + platform WebView | Signed personal-install Release APK, existing identity |
| iOS/iPadOS 17.4+ | Swift + WKWebView | Build and sign with Xcode on macOS |

Both load the configured HTTPS deployment, defaulting to
`https://forte-delta.vercel.app`. They reuse web accounts and server behavior;
they do not bundle Next.js or the database and do not promise offline startup.
External HTTPS links open outside the app. Social sign-in uses the system browser,
an expiring PKCE-bound one-time code, and native HttpOnly cookie installation.
Session tokens never cross URLs or JavaScript. There is no cleartext allowance,
TLS-validation bypass or general-purpose JavaScript/native token bridge.

```bash
# From mobile/android, with JDK 21 and Android SDK 36 installed:
sh ./gradlew assembleRelease  # requires FORTE_KEYSTORE_* and FORTE_KEY_* secrets
adb install -r app/build/outputs/apk/release/app-release.apk
```

On Windows, use `gradlew.bat assembleRelease`. The manually triggered
`.github/workflows/mobile.yml` uses the original signing identity from GitHub
Secrets and produces a signed Android Release APK, an iOS Release simulator app,
and an explicitly unsigned/noninstallable device `.app`. No installable IPA or
App Store readiness is implied; Apple devices need signing and provisioning.
See [mobile/README.md](mobile/README.md) for deployment overrides and limitations.

## Routes

| Route | Purpose |
|---|---|
| `/sign-in`, `/sign-up` | Authentication |
| `/` | Dashboard |
| `/exercises`, `/exercises/[id]`, `/exercises/new`, `/exercises/[id]/edit` | Exercise library |
| `/routines`, `/routines/[id]`, `/routines/new`, `/routines/[id]/edit` | Routine templates |
| `/workouts`, `/workouts/[id]` | History list / active logger or completed detail |
| `/progress` | Exercise picker for the canonical Statistics view |
| `/account` | Account settings (display name, IANA timezone) |
| `/workout` | Start/resume a workout and choose a routine |
| `/profile` | Progress, exercise library and account/settings shortcuts |
| `/api/auth/[...all]` | Better Auth handler |
| `/manifest.webmanifest`, `/icon`, `/apple-icon`, `/pwa-icon/[size]` | Generated PWA manifest and icons |

## Data model (highlights)

- `app_user` — canonical user (Better Auth fields + app profile).
- `exercise_template` — catalog: global (`owner_id IS NULL`) plus per-user custom exercises.
- `routine`, `routine_exercise`, `routine_set` — prescriptions (planned).
- `workout`, `workout_exercise`, `workout_set` — results (actual: reps, weight, duration,
  distance, RPE, completion; extensible `metrics` jsonb sidecar). `workout_exercise`
  also carries the snapshotted `rest_seconds` and `superset_key`.
- Vocabularies: `muscle_group`, `equipment`; enums: `set_type`, `exercise_type`,
  `workout_visibility`.

## Getting started

```bash
bun install
bun run db:migrate   # apply migrations to .pglite/
bun run db:seed:dev  # optional: demo account + history to explore with
bun run dev          # http://localhost:3000
```

Environment: local development needs no configuration (PGlite). For production set
`DATABASE_URL` (PostgreSQL), `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` — see `.env.example`.

## Scripts

```bash
bun run dev          # dev server
bun run build        # production build
bun run typecheck    # tsc --noEmit
bun run lint         # eslint
bun run verify:service-worker  # exercise service-worker cache isolation policy
bun run verify:browser  # critical path in a real browser (provisions its own database)
bun run verify:committed  # verify the committed tree in a throwaway worktree
bun run db:migrate   # apply SQL migrations
bun run db:seed:dev  # OPT-IN demo account + ~4 months of history (local databases only)
bun run db:verify    # run all schema/feature verification suites
bun run db:verify:postgres  # same suites against a temporary real PostgreSQL
```

## Testing

Verification suites live in `schema/tests/` and run against a real PostgreSQL (PGlite):

- `verify-schema` — core schema, constraints, triggers, cascade
- `verify-social` — follows, likes, comments, shares
- `verify-auth`, `verify-auth-flow`, `verify-account-lifecycle` — auth tables,
  sign-up/sign-in/session/sign-out, export and deletion
- `verify-exercises` — library, search/filter, ownership
- `verify-routines` — routine CRUD, ordering, transactions, visibility
- `verify-workouts`, `verify-workout-sync` — start/snapshot, set logging,
  completion, ownership, historical identity, offline reconciliation
- `verify-history` — history list, ordering, read-only enforcement, summaries,
  finish-time range boundaries and pagination beyond four pages
- `verify-records`, `verify-record-history`, `verify-previous-performance` — the
  Records engine, the history window that decides which workout earned a record,
  and the previous-performance lookup
- `verify-exercise-stats`, `verify-exercise-history` — the per-exercise
  Statistics and History tabs, per exercise type
- `verify-timezone` — local day boundaries, DST transitions, range lower bounds, end-to-end bucketing
- `verify-sharing` — public routine links, revocation, expiry, payload hygiene

Focused client-state checks:

```bash
bun run scripts/verify-set-suggestions.ts
bun run scripts/verify-rest-countdown.ts
```

The compact logger offers type-specific fields and muted suggestions: explicit
edits, snapshotted routine targets, compatible checked sets in this exercise, then
completed historical performance. Suggestions never mark a set done. A type sheet
keeps Normal/Warm-up/Failure/Drop set separate from removal; previous performance
is displayed independently. Duration-only sets use a recoverable elapsed timer,
with an explicit completion check after Play/Pause.

Default rest is an account-keyed **device** preference; per-exercise overrides are
saved in the workout snapshot (`null` inherits, `0` is Off). No migration is needed.
Typed metrics, deliberate blank/edit intent, routine targets and running timer
timestamps use the existing set `metrics` sidecar. Finish reviews completed totals,
leaves unchecked sets uncompleted, and retains a failed final draft for idempotent
retry. History/records continue to use only actual completed sets.

Two checks cover behavior beyond the schema suites:

- `bun run verify:service-worker` — the worker's cache separation policy: the
  public/static split, the private workout fallback, RSC exclusion, account
  cleanup, and in-flight response invalidation.
- `bun run verify:browser` — the critical path in a real browser. It provisions
  temporary embedded PostgreSQL by default, or creates an isolated database on
  `TEST_DATABASE_URL` when supplied; it migrates and seeds that database, builds
  and starts the app with a production environment, then walks: sign in → start a
  routine → log a set → go offline, log another, reload → reconnect → finish →
  find the workout and its record in history → sign out and prove the next
  account on that browser sees none of it. Needs a Chromium once:
  `bunx playwright install chromium`.
  CI supplies a PostgreSQL 18 service rather than depending on the embedded
  Linux binaries' obsolete ICU dependency. The runner drops only its own scratch
  database during cleanup; it never selects a database using `DATABASE_URL`.

  The journey now asserts that offline values and set-type changes survive a
  reload, reconcile after reconnect, and reach completed history. It also checks
  rest-deadline adjustment/skip across reload and the explicit Finish → review →
  Save flow. An immutable-asset build is required for the offline leg; do not
  reuse a production worker's cache while previewing unversioned development chunks.

```bash
bun run db:verify
```

Every suite runs against in-memory PGlite by default. Set `TEST_DATABASE_URL` to
run them against PostgreSQL instead (`TEST_DATABASE_URL=... bun run db:verify`) —
the suites never read `DATABASE_URL`, so they cannot be aimed at a real database
by accident. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment and the dialect
differences this uncovered.

`bun run verify:committed` checks the committed tree out into a throwaway
worktree and runs typecheck, lint, the service-worker check, the build and
`db:verify` there. It is the only run that can catch a tracked file importing an
untracked one, so it is the gate before claiming a commit is good.

CI (`.github/workflows/ci.yml`) runs typecheck, lint and the production build —
deliberately with **no environment variables**, so a build that starts requiring
secrets fails there rather than on someone's machine — plus the full suite on both
PGlite and a PostgreSQL service container, a run of the dev seed to prove it
still works against a freshly migrated database, and the browser critical path
against a PostgreSQL it provisions itself.
