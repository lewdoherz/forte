# AGENTS.md

Development rules for coding agents working in this repository.
Read this file before making changes. If a rule here conflicts with an ad-hoc instruction,
ask the user before proceeding — do not silently pick one.

---

## 1. What this repository is

A **pre-implementation workspace** for a workout-tracking app + website. It currently contains
research and a database schema. There is **no application code, no package manager manifest, and
no git repository yet**.

```
.hevy-key                 personal Hevy API key — SECRET, never commit/print/copy (§6)
Exercise vids/            452 reference demo videos — third-party copyrighted assets (§7)
hevy-structure/           reverse-engineering docs for hevy.com (7 .md + data/ with 7 files)
  README.md               architecture overview; start here for product context
  01..06-*.md             routes/features, private API, public API, data model, stack, design guidance
  data/                   machine-readable evidence (6 .json + 1 .md)
schema/
  migrations/0001_init.sql             core domain (users, catalog, routines, workouts)
  migrations/0002_seed_vocabularies.sql  canonical muscle groups + equipment
  migrations/0003_social.sql           follows, likes, comments, mentions, share links
  types.ts                             TypeScript row types for the schema
```

**Stack is not yet chosen.** Do not introduce a framework, ORM, test runner, or directory layout
by assumption; if one is needed, propose it to the user first. When the stack lands, update this
file in the same change (§9).

---

## 2. Language, naming, and formatting

- **TypeScript, `strict` mode.** No `any` (use `unknown` + narrowing). No non-null `!` assertions
  on values that can legitimately be null.
- **SQL and TypeScript identifiers are `snake_case`** and must match exactly. Table names are
  **singular** (`workout_like`, not `workout_likes`).
- File names: `snake_case.sql` for migrations, `kebab-case.md` for docs,
  `PascalCase.ts` for modules exporting a type/class, `camelCase.ts` otherwise.
- Prefer boring, explicit code over clever abstractions. No abstraction until there are two real
  call sites.
- Comments explain **why** (especially invariants), never restate the code.

---

## 3. Database conventions (non-negotiable; the existing migrations are the reference)

**Target: PostgreSQL 13+, no extensions.** `gen_random_uuid()` is core. Do not add `citext`,
`pg_trgm`, `uuid-ossp`, etc. without explicit approval — case-insensitive uniqueness is done with
expression indexes on `lower(...)`.

| Concern | Rule |
|---|---|
| Primary key | `id uuid primary key default gen_random_uuid()` |
| Timestamps | `created_at`/`updated_at timestamptz not null default now()` |
| `updated_at` | maintained by the `set_updated_at()` trigger, named `<table>_touch_updated_at`. It exists only on **mutable** rows (`app_user`, `exercise_template`, `routine_folder`, `routine`, `routine_exercise`, `routine_set`, `workout`, `workout_exercise`, `workout_set`, `follow`, `comment`) — one trigger per table, 11 in total. **Immutable event rows omit it entirely** — `workout_like`, `comment_mention`, `share` have `created_at` only |
| Ordering | explicit `position integer not null check (position >= 0)`; uniqueness per parent is `DEFERRABLE INITIALLY DEFERRED` so reorders/swaps work inside one transaction |
| Numeric | `numeric(7,3)` for weights, `numeric(3,1)` for RPE. Never `float` for stored values |
| Extensible metrics | `jsonb not null default '{}'` sidecar (`workout_set.metrics`) instead of a column per machine type |
| Cross-parent invariants | a **composite FK**, e.g. `foreign key (folder_id, owner_id) references routine_folder (id, owner_id)`, so a child cannot reference another owner's row |
| Exclusive arcs | N nullable FKs + `check (num_nonnulls(a, b, c) = 1)`. **Never** a polymorphic `(target_type, target_id)` pair — it forfeits referential integrity |
| Aggregates | **derived, never stored.** Follower counts, PRs, volume, 1RM and muscle distribution are computed from rows. A stored counter is a bug waiting to happen |
| Deletes | child collections `on delete cascade`; provenance links `on delete set null` (deleting a routine must not delete logged history); referenced catalog rows are `RESTRICT`, so retire them with an `archived_at` column |
| Vocabulary tables | use a **lookup table** when the values need display names, ordering or localisation (muscle_group, equipment); use a **native enum** only when the value drives behaviour in code (set_type, workout_visibility, exercise_type) |
| Documentation | `comment on table ...` for anything non-obvious; mark hard-won rules with `*INVARIANT*` in a comment |

When you add an invariant, **prove it is enforced** (§5) — a comment claiming integrity that the
database does not enforce is worse than no comment.

---

## 4. Migration rules

1. One file per change: `schema/migrations/NNNN_snake_name.sql`, zero-padded, **forward-only**.
   There are no down migrations; correct a mistake with a new migration.
2. Each file is **a single transaction** (`begin; ... commit;`) and assumes the previous migrations
   have been applied in order.
3. **Never edit a migration that has been applied.** Add `0004_...` instead.
4. Data migrations (seeds) must be **idempotent** — `insert ... on conflict (code) do update ...`,
   so they can be re-run safely. Schema migrations need not be.
5. Keep schema and types in lockstep: any schema change in the same change updates `schema/types.ts`.

---

## 5. Verification — required before claiming anything is done

An unverified claim is a defect. Match the evidence to the change:

| Change | Required proof |
|---|---|
| Migration / schema | Apply it to a **real PostgreSQL** and exercise it: happy path + every constraint you added or touched, including negative cases. Report pass/fail counts |
| `schema/types.ts` | `tsc --noEmit --strict` passes, **including `@ts-expect-error` assertions** for the invalid cases (an unused directive fails the build, so the negatives are load-bearing) |
| Docs / research output | Cite the artifact behind every non-obvious claim (§8) |
| Config / tooling | Demonstrate the tool actually failing when it should (e.g. a deliberate bad input), so a green result is meaningful |

**There is no local PostgreSQL, no Docker and no `psql` on this machine.** The accepted way to
verify SQL is **PGlite** (PostgreSQL compiled to WASM) driven from Bun:

```bash
mkdir -p C:/tmp/verify && cd C:/tmp/verify && bun init -y
bun add @electric-sql/pglite typescript
# apply migrations, then run assertions; exit non-zero on failure
bun run verify-schema.ts
bunx tsc --noEmit --ignoreConfig --strict --target es2022 --module esnext \
     --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck types-check.ts
```

The reference suites (`verify-schema.ts` — 31 checks, `verify-social.ts` — 32 checks,
`types-check.ts` — 14 negative type assertions) currently live in the scratch directory
`C:/tmp/verify`, **not in this repo**. They are the specification of correct behaviour: when the
test toolchain is chosen, **promote them into `schema/tests/`** rather than rewriting them, and
record the command in this file.

Note: PGlite is a real PostgreSQL, so constraint/enum/trigger/cascade behaviour is faithful.
It cannot verify Heroku/network/extension-specific behaviour. State that limitation when relevant.

---

## 6. Secrets

- `.hevy-key` is a **live API key for a third-party account**. Never commit it, never print it,
  never inline its value into a command, and never paste it into a prompt or a document.
- Read it inside a command substitution so the value never enters logs or model context:
  `K=$(tr -d '\r\n' < .hevy-key) && curl -s -H "api-key: $K" ...`
- The Hevy **web session** (cookies `auth2.0-token`, `access-token`) is a credential of equal
  sensitivity. It must never be written to a file in this repository.
- Never add credentials, tokens, or personal data to `hevy-structure/` — that directory is written
  to be shareable.
- When git is initialised, add a `.gitignore` covering at minimum:
  `.hevy-key`, `Exercise vids/`, `node_modules/`, `.env*`, `*.log`, `.DS_Store`.

---

## 7. Third-party content and licensing

- `Exercise vids/` contains **Hevy's copyrighted demo videos and are reference material only.**
  They must never be committed, shipped, served, or redistributed. Do not build them into an app,
  a fixture, a demo, or a compressed-asset pipeline.
- `hevy-structure/` documents another company's product from public artifacts. It is legitimate
  research input, but do **not** copy Hevy's code, brand, marketing copy, media, or iconography
  into anything user-facing. Reimplement structure and ideas; do not lift content.
- The exercise **catalog structure** (muscle groups, equipment, exercise types) is a standard
  fitness-domain model and is fine to reimplement. The **media** is not.
- Treat Hevy's private API as a research subject only. Do not build this product's features on
  undocumented endpoints belonging to someone else.

---

## 8. Evidence discipline (research and documentation changes)

Claims in `hevy-structure/` follow this tagging; keep it when editing those files:

- `[observed]` — seen in a live request/response or an HTTP header
- `[bundle]` — a literal string in a fetched JS artifact
- `[spec]` — stated in a published specification
- `[INFERENCE]` — your reading of the above, not directly stated

Rules: never present an inference as an observation; record **what was not verified** in an
explicit gaps/unknowns section; do not "clean up" a contradiction — report it and state which
side the evidence favours; never invent endpoints, fields, versions, or counts.

---

## 9. Working agreement for agents

1. **Scope discipline.** Do only what was asked. Do not add validation, retries, telemetry,
   abstractions, or "while I'm here" refactors. If you believe extra work is needed, say so and
   wait.
2. **No placeholders.** Never commit stubs, `TODO: implement`, mock fallbacks, or partially
   migrated call sites. A clean cut-over means every caller is updated in the same change.
3. **Read before writing.** Inspect the existing migrations and `types.ts` and follow their
   conventions. Introducing a second convention alongside an existing one is prohibited.
4. **Keep artefacts in sync.** Schema ⇄ types, docs ⇄ reality. If this file's rules change, update
   this file in the same change.
5. **Report honestly.** State what you ran, the observed result, and what remains unverified.
   Never describe work as verified when you only inspected it.
6. **Ask when it's genuinely the user's call** — stack choices, public API shape, destructive
   operations, anything with materially different trade-offs. Otherwise pick the boring,
   conservative option and state the choice.

---

## 10. Definition of done

- [ ] Behaviour implemented completely — no stubs, mocks, or deferred edges.
- [ ] Migrations apply cleanly in order to a fresh PostgreSQL and are forward-only.
- [ ] Every new invariant has a test that fails without it; negative cases included.
- [ ] `schema/types.ts` typechecks under `--strict`, with negative `@ts-expect-error` assertions.
- [ ] Verification was **executed**, and the observed result (with counts) is reported.
- [ ] No secrets, no third-party media, no copied content added.
- [ ] Docs/AGENTS.md updated where behaviour or rules changed.
