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
| `EMAIL_API_KEY` | **Required in production.** Resend API key. Verification and password-reset mail are part of sign-up and recovery, so the server refuses to start without it — an instance that cannot send them looks healthy while being unable to complete the flows. |
| `EMAIL_FROM` | **Required in production.** From address on outgoing mail, e.g. `forte <accounts@example.com>`. Resend requires a verified domain; until one is verified it delivers only to the account owner's own address. |
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

## Account lifecycle and email

Sign-up, recovery and deletion are Better Auth's flows; what was added is the mail
it sends, the pages that drive it, and the rules around both.

| Flow | Endpoints | Surfaces |
|---|---|---|
| Verification | `/send-verification-email` | Sent at sign-up; resendable from `/account` |
| Password reset | `/forget-password`, `/reset-password` | `/forgot-password`, `/reset-password` |
| Deletion | `deleteUser` | `/account`, behind a typed confirmation |
| Export | `/account/export` | A JSON download of everything the account owns |

**Verification does not gate sign-in.** Enforcing it would strand every account
created before the flow existed, whose `email_verified` is still false — including
the first production account. The state is surfaced on `/account` instead, and
`requireEmailVerification` can be turned on once no unverified accounts remain.

**A password reset revokes every other session.** A reset is the recovery path for
an account someone else may hold, so leaving other sessions alive would hand back
the access the reset was meant to remove.

**The three mail-sending endpoints carry their own rate limits** (3, 3 and 5 per
minute). Inheriting the global 100/60s allowance would make them an email-bombing
vector, since each request sends mail to an address the caller chooses.

**Transport.** Resend's HTTP API over `fetch`, so no SDK dependency has to be kept
current. With `EMAIL_API_KEY` unset, messages are written to `.mail/` at the repo
root instead — the bodies carry the verification and reset links, which is how
both flows are exercised locally without a provider account. A rejected send throws
with the provider's status and body rather than failing quietly: a dropped reset
email locks a user out while the request still looks successful.

**Deletion cascades.** Better Auth removes the `app_user` row; sessions, accounts,
routines, workouts and sets follow through the cascades in 0004 and the ownership
foreign keys. The lifecycle suite counts the dependants after a delete, and checks
that an export contains the owner's rows and nobody else's.

## The deployed instance

| | |
|---|---|
| Application | `forte` on Vercel, function region `iad1` |
| URLs | https://forte-delta.vercel.app (production), https://forte-herco1.vercel.app |
| Deployment | `dpl_2PeT8N4o7jSMBhAnVBWjuxW7ASgc`, target `production`, `READY` |
| Database | Neon project `forte` — PostgreSQL 18.6, `us-east-2`, pooled endpoint |
| Environment | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUST_FORWARDED_HEADER=true` |

**A redeploy now requires the email variables.** `EMAIL_API_KEY` and
`EMAIL_FROM` joined the required set when the account lifecycle landed, so the
project refuses to boot without them — set both in the Vercel project before the
next deployment.

**The Vercel project is not linked to the GitHub repository** (`link: null`), so
pushing to `main` does **not** deploy. Linking needs a browser step — Vercel →
Account Settings → Login Connections → connect GitHub — after which the project
can be linked and push-to-deploy enabled. Until then, deployments are made
explicitly.

`sslmode=verify-full` is set on `DATABASE_URL` deliberately. `pg` currently treats
`require` as `verify-full`, but warns that `pg-connection-string` v3 will adopt
libpq semantics, under which `require` no longer verifies the certificate chain.
Pinning the strict mode keeps the connection verified across that upgrade.

The database is in `us-east-2` and functions run in `iad1`, which is the platform
default; the round trip is a few milliseconds and needs no tuning.

### What was verified against it

Checked over HTTPS against the deployed instance rather than inferred from source:

| Check | Result |
|---|---|
| `/sign-in` | `200`, `text/html` |
| `/manifest.webmanifest` | `200`, `application/manifest+json`; icons 192/512, one maskable |
| `/icon`, `/apple-icon`, `/pwa-icon/512` | `200`, `image/png` — installable over HTTPS |
| Protected route, signed out | `307` → `/sign-in` |
| Unmatched URL | `404`, boundary copy rendered |
| Sign-up / sign-in | `200`, session cookie `__Secure-better-auth.session_token` — `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` |
| Not-found inside the shell, signed in | shell boundary rendered, primary navigation intact |
| Rate limiting | four `401`s, then `429` — "Too many requests. Please try again later." |
| Per-client buckets | one bucket key per client IP — `<ip>|/sign-in/email` |

The cookie carries the `__Secure-` prefix, which browsers accept only over HTTPS,
alongside `Secure` and `HttpOnly`.

Two things that run surfaced:

- **`notFound()` inside the protected shell answers `200`, not `404`.** The right
  UI and navigation render, but the status is committed before the not-found is
  raised, because the shell's layout awaits the session and active-workout queries
  and therefore streams first. Impact is small — signed-out clients and crawlers
  get the `307` to `/sign-in` and never reach it — but the status is wrong for
  signed-in clients.
- **The rate limiter keys per client IP, as intended.** Requests from two
  different runner addresses produced two distinct buckets, so one client
  tripping the limit cannot lock out others. That is precisely the behaviour
  `TRUST_FORWARDED_HEADER=true` depends on: had the platform header not been
  resolved, every request would have shared a single bucket.

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
Each suite creates a `forte_verify` scratch database and drops it again when it
finishes, so pointing the suites at a shared server leaves nothing behind.

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
