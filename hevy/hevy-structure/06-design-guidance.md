# 06 — Design guidance for your own app + website

This is the "what do I do with all of the above" document. It assumes you will build a fitness
tracker with social and routine features, i.e. the same product category.

---

## 1. The three decisions to make before writing code

Hevy's structure forces three choices on anyone in this category. Make them explicitly — Hevy made
them implicitly and now carries the cost of three muscle vocabularies and two id spaces.

| Decision | Hevy's answer | Recommendation |
|---|---|---|
| Where is logging done? | Mobile only; web = read/social/author | Pick **one primary capture surface** for v1. Offline-first mobile is hard; web capture is easier to ship and test. Do web-first only if you accept weaker gym UX. |
| One API or two? | Private unversioned API for own clients + documented public v1 for third parties, same data | Build **one internal API** with a versioned path from day 1, then expose a *projection* for third parties. Do not start with two shapes. |
| Canonical vocabularies | 24 UI + 20 public + 6 summary muscle groups; camelCase vs snake_case | Define **one canonical enum set** (snake_case) in a shared package; every surface maps to it. |

## 2. Canonical schema (start here)

Postgres-flavoured sketch, derived from the verified relations in `04-data-model.md`:

```sql
-- vocabulary
create table muscle_group (code text primary key, display_name text not null);
create table equipment    (code text primary key, display_name text not null);

create table exercise_template (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,          -- stable, human-readable, your URL key
  title             text not null,
  exercise_type     text not null,                 -- weight_reps | duration | distance_duration | ...
  primary_muscle    text not null references muscle_group(code),
  secondary_muscles text[] not null default '{}',
  equipment         text not null references equipment(code),
  media_url         text,                          -- your own or licensed asset
  is_custom         boolean not null default false,
  owner_id          uuid references app_user(id),  -- null = global catalog
  created_at        timestamptz not null default now()
);
create index on exercise_template (primary_muscle, equipment);

create table routine (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references app_user(id),
  folder_id  uuid references routine_folder(id),
  title      text not null,
  notes      text,
  position   int  not null default 0,             -- explicit ordering, not array position
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table routine_exercise (
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid not null references routine(id) on delete cascade,
  template_id   uuid not null references exercise_template(id),   -- denormalized join hub
  position      int  not null,
  superset_key  text,                                            -- groups rows into a superset
  rest_seconds  int,
  notes         text
);

create table routine_set (          -- prescription: no results
  id            uuid primary key default gen_random_uuid(),
  routine_exercise_id uuid not null references routine_exercise(id) on delete cascade,
  position      int not null,
  set_type      text not null default 'normal',   -- warmup|normal|failure|dropset
  reps          int, rep_range_start int, rep_range_end int,
  weight_kg     numeric(7,3),
  duration_seconds int, distance_meters int, custom_metric numeric
);

create table workout (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references app_user(id),
  routine_id  uuid references routine(id) on delete set null,
  title       text not null,
  notes       text,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  visibility  text not null default 'public',     -- public|followers|private
  created_at  timestamptz not null default now()
);
create index on workout (owner_id, started_at desc);

create table workout_exercise (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references workout(id) on delete cascade,
  template_id uuid not null references exercise_template(id),     -- same hub as routines
  position    int not null,
  superset_key text,
  notes       text
);
create index on workout_exercise (template_id);      -- powers per-exercise history/stats

create table workout_set (          -- actual results, immutable
  id            uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercise(id) on delete cascade,
  position      int not null,
  set_type      text not null default 'normal',
  reps int, weight_kg numeric(7,3), duration_seconds int, distance_meters int,
  rpe numeric(3,1),
  metrics       jsonb not null default '{}',       -- geospatial, steps, floors, …
  completed_at  timestamptz
);
create index on workout_set (workout_exercise_id, position);
```

Why these choices:

- **`template_id` denormalized on both `routine_exercise` and `workout_exercise`** — that index is
  what makes per-exercise stats a single scan (Hevy does exactly this).
- **Separate prescription (`routine_set`) and result (`workout_set`) tables.** Hevy's public API
  splits request/read models for the same reason: results carry data prescriptions never do
  (`rpe`, `completed_at`, PRs) and prescriptions carry ranges.
- **`metrics jsonb`** instead of a column per machine type — Hevy is already paying for
  `custom_metric` + `geospatial_data` additions; you can avoid the migrations.
- **`position` columns, not array order** — array order is invisible to SQL and breaks under
  partial updates.
- **One `app_user` table, not per-surface auth tables.**

## 3. Feature phasing (mirrors how Hevy's own surface is organised)

| Phase | Ship | Backed by |
|---|---|---|
| **MVP** | Exercise catalog (curated: 150–300 movements is enough), workout logging with sets/reps/weight, per-exercise history, personal records | `exercise_template`, `workout*`, `workout_set` |
| **v1** | Routines + folders + supersets + rest timers, routine → workout ("start routine"), unit preferences | `routine*` (Hevy's `routines_sync_batch` shows batch sync matters here) |
| **v2** | Progress analytics: 1RM, volume, weekly volume, muscle distribution, calendar heatmap | derived from `workout_set` (never store aggregates) |
| **v3** | Social: follow, feed, likes, comments, share links (public profile + short links) | `follow`, `comment`, `like`, visibility |
| **v4** | Monetization: free vs pro limits, plans, coupons; then **public API + webhooks** | Hevy's paywall limits: routines, history depth, exercise count, API access |
| **v5** | Coaching / B2B (invite by link + short id, client onboarding) | Hevy keeps this as a separate product line (`hevycoach.com`, `/coach/*`) |

Deliberately *later*: custom exercise creation with image upload (needs `presigned_url` upload
plumbing — Hevy has one), Hevy-Trainer-style authored programs, third-party OAuth provider mode.

## 4. UI patterns worth copying verbatim

1. **Typed result columns.** A workout table renders `weight × reps` for strength, `duration` for
   holds, `distance/time` for cardio — driven by `exercise_type`, not by a fixed template
   (`web.workoutDetails.secondColumnHeader.*`). This is the difference between a tracker that
   supports 6 exercise types and one that only supports barbells.
2. **Second-step confirms for everything destructive *and* for re-saving.** Hevy has dedicated copy
   for `saveRoutineAgain`, `saveFolderAgain`, `saveProgramAgain` — because links get re-clicked.
3. **Explicit empty / not-found / private states** for every collection (see `01` §5). Their key set
   is effectively a QA checklist.
4. **Coarse muscle groups for charts, fine ones for filters.** Despite the vocabulary sprawl, the
   two-level split is right: 6 groups read well in a pie chart, 24 in a filter.
5. **Collapsed share id in URLs** (`/routine/2oxdt9VDsv3`) rather than the UUID — short links get
   pasted into chats.

## 5. Recommended stack for your build

Given what Hevy runs and where the ecosystem is now:

| Layer | Pick | Why not Hevy's |
|---|---|---|
| Web | Next.js **App Router** on Vercel | Theirs is pages-router 13.4.19; no reason to start behind |
| Styling | Tailwind or styled-components — either is fine | Cosmetic |
| Server state | TanStack Query / SWR | Replaces their MobX-store + SSR bootstrap dance |
| Client state | Zustand/Jotai only where genuinely global | Avoid a global store holding server data |
| API | Node/Go service with **versioned** paths (`/v1`) from day 1 | Theirs is unversioned; that is a one-way door |
| DB | Postgres + a metrics `jsonb` sidecar | Matches the model above |
| Media | S3-compatible + CDN with predictable keys | Same as Hevy, and it works |
| Auth | Email+password + Google/Apple OAuth; short-lived access token + refresh, server-side session cookie for SSR | Same pattern as Hevy (README §3) — it is correct and boring |
| Payments | Stripe (web) + store IAP (mobile) | Hevy uses Paddle; Stripe is the safer default for a new product |
| Analytics | One product-analytics tool + error tracking | Hevy runs 5+ beacons; pick one, e.g. PostHog (analytics + flags + errors in one) |

## 6. Risks and open questions

**Risks**

- **Exercise media licensing.** Hevy's demo videos are their assets (README §9). Budget for
  licensed footage, your own recordings, or text/form cues only. This is the single biggest
  hidden cost in cloning this category.
- **Vocabulary sprawl** is the most common long-term tax: pick canonical enums now, and add a
  mapping test that fails when a new UI label has no canonical code.
- **Offline sync** is where fitness apps die. If you defer it (like Hevy's web does), say so in
  product terms ("log in the app") rather than pretending.
- **Personal-record computation** must be deterministic and recomputable: define PR rules
  (by 1RM formula? by weight? by reps at weight?) up front, version them, and recompute from
  `workout_set` when rules change.

**Open questions only you can answer**

1. Mobile-first capture or web-first? (Determines the whole client architecture.)
2. Do you need third-party API access in year 1? If not, defer the public API — but keep your
   internal one versioned so the projection is cheap later.
3. Social from day 1, or single-player until retention is proven? Hevy's social surface is the
   largest part of its web app; it is also the hardest to moderate.
4. What is your differentiator? Nothing in this document is a moat — the moat is the thing you
   deliberately do *differently* from the structure above.

## 7. Where to look for specifics

| Question | File |
|---|---|
| What screens exist and what they do | `01-routes-and-features.md` |
| What the real backend looks like | `02-api-private.md` |
| What a documented, clean API looks like | `03-api-public.md` |
| Entity fields and enums | `04-data-model.md` |
| Hosting, CDN, third parties | `05-stack-and-infrastructure.md` |
| Raw machine-readable evidence | `data/*.json` |
