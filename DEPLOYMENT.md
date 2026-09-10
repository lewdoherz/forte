# Deploying forte

The application runs unchanged against two PostgreSQL dialects:

| Environment | Driver | Configuration |
|---|---|---|
| Local development | PGlite (PostgreSQL compiled to WASM) in `.pglite/` | none — zero-config |
| Production | `pg` against a real PostgreSQL server | `DATABASE_URL` |

`lib/db.ts` selects the dialect from `DATABASE_URL`; no code changes are needed
to switch.

## Required environment variables

Validated by `lib/env.ts` with zod. Present values are always shape-checked; the
three marked below are **required in production**, and a production server
refuses to start without them (`assertProductionEnv()`, invoked from
`instrumentation.ts`).

| Variable | Notes |
|---|---|
| `DATABASE_URL` | **Required in production.** `postgres://` or `postgresql://`. Unset locally, this falls back to PGlite. |
| `BETTER_AUTH_SECRET` | **Required in production.** Token-signing secret, minimum 32 characters. Generate with `openssl rand -base64 32`. A development-only fallback is used outside production and must never protect real data. |
| `BETTER_AUTH_URL` | **Required in production.** Absolute origin used for auth callbacks and redirects, e.g. `https://forte.example.com` — no trailing slash. Unset locally, Better Auth derives the origin from the request. |
| `NODE_ENV` | Set by the platform. `production` activates the requirements above. |

See `.env.example`. Note that `next build` also runs with `NODE_ENV=production`
but is deliberately excluded from the startup check (`lib/env.ts` distinguishes
the build phase), so a build does not require runtime secrets to be present.

## Deployment sequence

```bash
bun install
bun run db:migrate      # applies schema/migrations to DATABASE_URL
bun run build
bun run start
```

`db:migrate` is idempotent — applied files are recorded in `schema_migrations`
and skipped on subsequent runs — so it is safe to run on every deploy.

**Migrations run before the new version starts.** They are additive SQL
(`schema/migrations/NNNN_*.sql`) and the raw SQL files remain the schema
authority; no ORM owns or generates the schema.

## Platform notes

- **Runtime:** Bun is the package manager and script runner (`packageManager:
  bun@1.4.2`). Node.js 20+ can run the built server if Bun is unavailable at
  runtime.
- **Framework:** Next.js 16 App Router. All data-backed routes are dynamic
  (server-rendered on demand); only the PWA metadata routes (`/icon`,
  `/apple-icon`, `/manifest.webmanifest`) and `/_not-found` are static.
- **PWA assets are generated, not static files.** `next/og` renders the icons at
  request/build time, so no image binaries are committed.
- **No service worker.** There is deliberately no offline behaviour; do not
  configure a CDN to serve the app shell as if it were offline-capable.
- **Connection pooling:** a single `pg.Pool` per server process. If your platform
  runs many instances, use a pooler (e.g. PgBouncer) and set `DATABASE_URL`
  to it.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **quality** — install with a frozen lockfile, then typecheck, lint and the production
  build. The build runs with **no environment variables on purpose**: `next build`
  serves no traffic, so `lib/env.ts` exempts the build phase and the build must succeed
  without runtime secrets. If that ever stops being true, this job fails instead of a
  deployment.
- **verify-pglite** — every verification suite against in-memory PGlite, followed by the
  development seed, which proves the seed still works against a database that
  migrations have just created.
- **verify-postgres** — the same suites against a `postgres:18-alpine` service
  container, reached through `TEST_DATABASE_URL`.

**No repository secrets are required.** The suites read `TEST_DATABASE_URL` and never
`DATABASE_URL`, so CI cannot be pointed at a real database.

## Client IP and rate limiting

Rate limiting keys on the client IP, which is read from forwarded headers, so the
deployment's topology must be declared with **exactly one** of:

| Topology | Variable | Why |
|---|---|---|
| A proxy you run appends `X-Forwarded-For` | `TRUSTED_PROXY_CIDRS` | The chain is stripped from the right to the first untrusted hop, so a client cannot prepend a fake address. |
| The platform sets the header itself | `TRUST_FORWARDED_HEADER=true` | The single value is authoritative; no proxy addresses are needed. Vercel documents that it **overwrites** `X-Forwarded-For` and does not forward external IPs "to prevent IP spoofing". |

Getting this wrong is silent in both directions. Without trusted proxy addresses a
single-value `X-Forwarded-For` is accepted from any caller — a fresh value per request
is a fresh bucket, so the limit never binds. And a multi-hop chain is refused
outright — every caller then shares one bucket, so a single abusive client can lock
everyone out of signing in. The server warns at startup when neither is declared, and
when both are; declaring neither is only correct locally, where rate limiting is off.

## Verifying a deployment

```bash
bun run typecheck        # tsc --noEmit
bun run lint             # eslint
bun run build            # production build
bun run db:verify        # all verification suites (PGlite by default)
```

To run the suites against PostgreSQL instead of PGlite, set
`TEST_DATABASE_URL` to a server you are willing to have a scratch database
created and dropped on:

```bash
TEST_DATABASE_URL="postgresql://user:pass@host:5432/postgres" bun run db:verify
```

The suites deliberately key on `TEST_DATABASE_URL` and never on `DATABASE_URL`,
so tests can never be aimed at a development or production database by accident.
Each suite creates and drops its own `forte_verify` database.

### Dialect differences found by running against both

- **`bigint` is returned as a string by `pg`, but as a number by PGlite.**
  PostgreSQL's `count(*)` is `bigint` (`int8`), and node-postgres does not parse
  it into a JavaScript number by default, so `count(*)` arrives as `"0"` and
  strict comparisons like `=== 0` fail. Four cascade assertions in the suites
  were silently relying on the PGlite behaviour. Fixed by casting the aggregates
  to `::int` in the query, which is dialect-independent. **Application impact:
  none today** — every `count` Kysely issues is cast explicitly (e.g.
  `count(*)::int` in `lib/workouts.ts`). Any future raw `count` must be cast, or
  compared loosely, or it will behave differently in production.
- Everything else — migrations, enum types, deferrable unique constraints,
  composite foreign keys, `ON DELETE CASCADE`/`NO ACTION`, `set_updated_at()`
  triggers, `gen_random_uuid()`, `jsonb` defaults — behaves identically on both.

No application SQL required a dialect-specific branch.

For a self-contained check with no external Postgres, `bun run
db:verify:postgres` boots a temporary PostgreSQL 18 server (via the
`embedded-postgres` devDependency), migrates it through the real `DATABASE_URL`
path under a production environment, runs every suite against it, and tears it
down. That dependency ships binaries and is **verification tooling only** — the
application never imports it.
