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
| Auth | Better Auth (email + password) |
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
- **Analytics are derived, and aggregated in SQL.** PRs, volume, estimated 1RM and
  progression are computed from completed sets at read time — never stored as
  authoritative records. The aggregation runs in the database, so result sizes stay
  bounded by the number of *sessions* rather than the number of *sets*; an earlier
  implementation folded every completed set in JavaScript, which grew without bound.
- **Failures are visible.** Route-level `error`/`loading`/`not-found` boundaries render
  inside the shell so navigation survives a failure, and the reference they show is the
  same `digest` recorded server-side by `onRequestError` (instrumentation.ts) through
  `lib/log.ts`. Server actions no longer swallow unexpected failures; expected
  outcomes (an ownership check, a stale page) are filtered out so real ones are not
  buried. The log never carries error messages, which can embed SQL, parameters or
  connection strings.
- **Mobile shell.** Below `sm` the primary navigation is a fixed bottom bar
  (`components/bottom-nav.tsx`); the desktop header nav is hidden. The bar is omitted
  entirely on `/workouts/[id]` so the logger's sticky control bar owns the bottom of the
  screen. Safe areas come from `viewportFit: "cover"` plus
  `pb-[env(safe-area-inset-bottom)]`. There is deliberately **no service worker** — no
  offline or background sync.
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
| 10 | Progress analytics + PRs (`/progress`, Epley 1RM, charts) | done |
| 11 | Mobile-first shell (bottom nav, safe areas, touch targets) + installable PWA (manifest, generated icons) | done |
| 12 | Production readiness: validated env, secret hardening, timezone-aware analytics, account settings, PostgreSQL path verified | done |
| 13 | Operability: CI, failure boundaries, structured logging, opt-in dev seed, SQL-aggregated analytics | done |
| 14 | Logger depth: snapshotted rest target with a rest timer, and superset grouping | done |

## Routes

| Route | Purpose |
|---|---|
| `/sign-in`, `/sign-up` | Authentication |
| `/` | Dashboard |
| `/exercises`, `/exercises/[id]`, `/exercises/new`, `/exercises/[id]/edit` | Exercise library |
| `/routines`, `/routines/[id]`, `/routines/new`, `/routines/[id]/edit` | Routine templates |
| `/workouts`, `/workouts/[id]` | History list / active logger or completed detail |
| `/progress` | Per-exercise analytics and PRs |
| `/account` | Account settings (display name, IANA timezone) |
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
bun run db:migrate   # apply SQL migrations
bun run db:seed:dev  # OPT-IN demo account + ~4 months of history (local databases only)
bun run db:verify    # run all schema/feature verification suites
bun run db:verify:postgres  # same suites against a temporary real PostgreSQL
```

## Testing

Verification suites live in `schema/tests/` and run against a real PostgreSQL (PGlite):

- `verify-schema` — core schema, constraints, triggers, cascade
- `verify-social` — follows, likes, comments, shares
- `verify-auth`, `verify-auth-flow` — auth tables + sign-up/sign-in/session/sign-out
- `verify-exercises` — library, search/filter, ownership
- `verify-routines` — routine CRUD, ordering, transactions, visibility
- `verify-workouts` — start/snapshot, set logging, completion, ownership, historical identity
- `verify-history` — history list, ordering, read-only enforcement, summaries
- `verify-progress` — PRs, Epley 1RM, volume, ranges, ownership
- `verify-timezone` — local day boundaries, DST transitions, range lower bounds, end-to-end bucketing

```bash
bun run db:verify
```

Every suite runs against in-memory PGlite by default. Set `TEST_DATABASE_URL` to
run them against PostgreSQL instead (`TEST_DATABASE_URL=... bun run db:verify`) —
the suites never read `DATABASE_URL`, so they cannot be aimed at a real database
by accident. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment and the dialect
differences this uncovered.

CI (`.github/workflows/ci.yml`) runs typecheck, lint and the production build —
deliberately with **no environment variables**, so a build that starts requiring
secrets fails there rather than on someone's machine — plus the full suite on both
PGlite and a PostgreSQL service container, and a run of the dev seed to prove it
still works against a freshly migrated database.
