# forte

A web-based workout tracker inspired by Hevy: authentication, an exercise library,
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
- **Analytics are derived.** PRs, volume and progression are computed from completed
  sets — never stored as authoritative records.

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

## Routes

| Route | Purpose |
|---|---|
| `/sign-in`, `/sign-up` | Authentication |
| `/` | Dashboard |
| `/exercises`, `/exercises/[id]`, `/exercises/new`, `/exercises/[id]/edit` | Exercise library |
| `/routines`, `/routines/[id]`, `/routines/new`, `/routines/[id]/edit` | Routine templates |
| `/workouts`, `/workouts/[id]` | History list / active logger or completed detail |
| `/progress` | Per-exercise analytics and PRs |
| `/api/auth/[...all]` | Better Auth handler |

## Data model (highlights)

- `app_user` — canonical user (Better Auth fields + app profile).
- `exercise_template` — catalog: global (`owner_id IS NULL`) plus per-user custom exercises.
- `routine`, `routine_exercise`, `routine_set` — prescriptions (planned).
- `workout`, `workout_exercise`, `workout_set` — results (actual: reps, weight, duration,
  distance, RPE, completion; extensible `metrics` jsonb sidecar).
- Vocabulary lookup tables: `muscle_group`, `equipment`; enums: `set_type`,
  `exercise_type`, `workout_visibility`.

## Getting started

```bash
bun install
bun run db:migrate   # apply migrations to .pglite/
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
bun run db:verify    # run all schema/feature verification suites
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

```bash
bun run db:verify
```
