# Working on forte

## Read first
- `README.md` describes architecture, routes, and local commands.
- `DEPLOYMENT.md` describes runtime configuration and deployment constraints.
- `docs/offline-logging.md` describes the deliberately narrow offline envelope.
- `HANDOFF.md`, when present, is historical context, not schema or implementation authority.
- For Next.js APIs, use the version-matched docs in `node_modules/next/dist/docs/`.

## Invariants
- Hand-written SQL migrations in `schema/migrations/` own the schema. Kysely is a query layer, not an ORM; do not add another schema authority.
- Better Auth's session user id is `app_user.id`. Every read/write must scope ownership on the server; never accept an owner id from client input.
- Routines are templates; started workouts are snapshots. Editing a routine must not change an existing workout. Finished workouts are immutable.
- Reuse `lib/workout-stats.ts`, the history projection, and the Records engine for metrics. Analytics use completed sets from finished workouts; incomplete/active data is not a personal record.
- Store canonical kg/metres. Calendar boundaries and labels use the account's stored IANA timezone, through `lib/timezone.ts`, not the server or browser timezone.
- Keep client imports free of DB/auth/Node-only dependencies. Export client-safe labels and formatters from client-safe modules.
- Offline documents and private route caches are account-scoped. Account change, sign-out, and deletion must purge both. Never cache general authenticated pages or RSC responses.
- Never put tokens, signing keys, database URLs, or workout contents in source, logs, fixtures, or generated app assets.

## UI
- Reuse existing forms/actions/cards before introducing abstractions. No fabricated progress, streaks, goals, or sample data in an authenticated screen.
- Verify populated and new-account states at phone, tablet, and desktop widths. Check long labels, horizontal overflow, keyboard focus, touch targets, and bottom navigation/safe areas.
- Native clients in `mobile/` load the hosted HTTPS app; they do not run Next.js or PostgreSQL locally. Keep same-origin navigation and persistent auth, open external HTTPS links outside the shell, and never add a JavaScript/native bridge or bypass TLS validation.
- Web service-worker verification is not evidence of Android WebView or WKWebView offline support. Report device checks separately.

## Verification
- `bun run typecheck` and `bun run lint` check the web code.
- `bun run db:verify` runs isolated PGlite suites; `bun run db:verify:postgres` runs the same suites against disposable PostgreSQL. Tests use `TEST_DATABASE_URL`, never `DATABASE_URL`.
- `bun run verify:service-worker` checks cache policy.
- `bun run verify:browser` builds with webpack and exercises the production browser journey with a disposable PostgreSQL server. It does not share the development DB.
- `bun run verify:committed` is the committed-tree gate. Hardened Windows can block Turbopack junction traversal; report that limitation rather than silently claiming the gate passed.
- See `mobile/README.md` for native builds. Android APK execution and an iOS simulator/device build are distinct checks; unsigned simulator output is not an installable iPhone release.
- Significant behavior changes need an actual surface smoke run. Keep regression tests for meaningful boundaries, transitions, ownership, and errors; do not test implementation text or trivial wiring.

## Delivery
- Update existing product/deployment documentation when behavior changes.
- Do not commit or push unless requested. A push to `main` can deploy production.
- Distinguish source implementation, local build proof, device behavior, CI results, and deployed verification. Never substitute one for another.
