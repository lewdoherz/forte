-- ---------------------------------------------------------------------------
-- 0001_init.sql — core domain schema for a workout tracker
--
-- Target: PostgreSQL 13+ (uses core gen_random_uuid(); no extensions required).
--
-- Run with any plain-SQL migration runner (dbmate, node-pg-migrate, Flyway,
-- sqitch, `psql -f`) or as a Drizzle/Prisma "custom migration". It is a single
-- transaction and is idempotent-safe only on a fresh database.
--
-- Deliberate design notes are inline where a choice is non-obvious; the two
-- that matter most are marked *INVARIANT*.
-- ---------------------------------------------------------------------------

begin;

-- ===========================================================================
-- Enumerations
-- ===========================================================================
-- Native enums are used only for closed sets that drive *behaviour* in code.
-- Data-driven vocabularies (muscle groups, equipment) are lookup tables instead,
-- because they need display names, ordering and localisation.

create type set_type as enum ('warmup', 'normal', 'failure', 'dropset');

create type workout_visibility as enum ('public', 'followers', 'private');

-- The full vocabulary for how a set is measured. External APIs expose
-- *differently named* subsets (e.g. bodyweight_assisted_reps); this schema
-- standardises on one vocabulary and maps at the edge.
create type exercise_type as enum (
  'weight_reps',
  'bodyweight_reps',
  'bodyweight_weighted',
  'bodyweight_assisted',
  'reps_only',
  'duration',
  'weight_duration',
  'distance_duration',
  'short_distance_weight',
  'floors_duration',
  'steps_duration'
);

-- ===========================================================================
-- Vocabularies (lookup tables, seeded in 0002_seed_vocabularies.sql)
-- ===========================================================================

create table muscle_group (
  code         text primary key,
  display_name text not null,
  sort_order   integer not null default 0
);

create table equipment (
  code         text primary key,
  display_name text not null,
  sort_order   integer not null default 0
);

-- ===========================================================================
-- Identity
-- ===========================================================================

create table app_user (
  id              uuid primary key default gen_random_uuid(),
  username        text not null,
  email           text not null,
  display_name    text,
  bio             text,
  link            text,
  profile_pic_url text,
  private_profile boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Case-insensitive uniqueness without the citext extension.
create unique index app_user_username_lower_key on app_user (lower(username));
create unique index app_user_email_lower_key    on app_user (lower(email));

-- ===========================================================================
-- Exercise catalog — the join hub of the whole domain
-- ===========================================================================

create table exercise_template (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null,
  title              text not null,
  exercise_type      exercise_type not null,
  primary_muscle     text not null references muscle_group (code),
  secondary_muscles  text[] not null default '{}',
  equipment          text not null references equipment (code),
  media_url          text,
  is_custom          boolean not null default false,
  owner_id           uuid references app_user (id) on delete cascade,
  -- Retire a custom exercise without breaking history that references it.
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint exercise_template_slug_key unique (slug),
  -- Custom templates belong to a user; global catalog rows have no owner.
  constraint exercise_template_custom_owner_chk check (is_custom = (owner_id is not null)),
  constraint exercise_template_secondary_muscles_chk
    check (array_position(secondary_muscles, null) is null)
);

create index exercise_template_muscle_equipment_idx
  on exercise_template (primary_muscle, equipment);
create index exercise_template_owner_idx  on exercise_template (owner_id);
create index exercise_template_title_lower_idx on exercise_template (lower(title));

comment on table exercise_template is
  'Global catalog rows (owner_id is null, is_custom false) plus per-user custom exercises. '
  'Referenced by routine_exercise.template_id and workout_exercise.template_id — that '
  'denormalised reference is what makes per-exercise history a single indexed query.';

-- ===========================================================================
-- Routines (prescriptions)
-- ===========================================================================

create table routine_folder (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references app_user (id) on delete cascade,
  title      text not null,
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Enables the composite FK from routine below (folder and routine must share an owner).
  constraint routine_folder_id_owner_key unique (id, owner_id)
);

create index routine_folder_owner_position_idx on routine_folder (owner_id, position);

create table routine (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references app_user (id) on delete cascade,
  folder_id  uuid,
  title      text not null,
  notes      text,
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- *INVARIANT*: a routine may only live in a folder owned by the same user.
  -- The composite FK makes a cross-owner folder assignment impossible.
  -- Consequence: deleting a populated folder fails (NO ACTION). Move its
  -- routines to the default (folder_id = null) first, in the same transaction.
  constraint routine_folder_owner_fk
    foreign key (folder_id, owner_id) references routine_folder (id, owner_id)
);

create index routine_owner_folder_position_idx on routine (owner_id, folder_id, position);

create table routine_exercise (
  id           uuid primary key default gen_random_uuid(),
  routine_id   uuid not null references routine (id) on delete cascade,
  template_id  uuid not null references exercise_template (id),
  position     integer not null check (position >= 0),
  -- Rows sharing a superset_key (within one routine) are performed together.
  superset_key text,
  rest_seconds integer check (rest_seconds >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- *INVARIANT*: position is unique per routine, but the check is DEFERRABLE so
  -- a reorder can swap two rows inside one transaction.
  constraint routine_exercise_position_key
    unique (routine_id, position) deferrable initially deferred
);

create index routine_exercise_template_idx on routine_exercise (template_id);

create table routine_set (
  id                  uuid primary key default gen_random_uuid(),
  routine_exercise_id uuid not null references routine_exercise (id) on delete cascade,
  position            integer not null check (position >= 0),
  set_type            set_type not null default 'normal',
  reps                integer check (reps >= 0),
  rep_range_start     integer check (rep_range_start >= 0),
  rep_range_end       integer check (rep_range_end >= 0),
  weight_kg           numeric(7, 3) check (weight_kg >= 0),
  duration_seconds    integer check (duration_seconds >= 0),
  distance_meters     integer check (distance_meters >= 0),
  custom_metric       numeric(12, 3) check (custom_metric >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint routine_set_position_key
    unique (routine_exercise_id, position) deferrable initially deferred,

  -- A rep range is all-or-nothing, and ordered.
  constraint routine_set_rep_range_chk check (
    (rep_range_start is null) = (rep_range_end is null)
    and (rep_range_start is null or rep_range_start <= rep_range_end)
  )
);

-- No CHECK forces a set to carry a metric: a "checkbox" set (bodyweight,
-- mobility, or a warmup the user simply marked done) is legitimate.

comment on table routine_set is
  'Prescription only. Results live in workout_set — the two are intentionally '
  'separate types so that result-only fields such as rpe, completed_at and PRs '
  'cannot leak into a plan.';

-- ===========================================================================
-- Workouts (results, immutable in spirit)
-- ===========================================================================

create table workout (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references app_user (id) on delete cascade,
  -- Provenance only: deleting the routine must not delete logged history.
  routine_id uuid references routine (id) on delete set null,
  title      text not null,
  notes      text,
  started_at timestamptz not null,
  ended_at   timestamptz,
  visibility workout_visibility not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_time_chk check (ended_at is null or ended_at >= started_at)
);

create index workout_owner_started_idx on workout (owner_id, started_at desc);

create table workout_exercise (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references workout (id) on delete cascade,
  template_id  uuid not null references exercise_template (id),
  position     integer not null check (position >= 0),
  superset_key text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint workout_exercise_position_key
    unique (workout_id, position) deferrable initially deferred
);

-- Powers "every set of exercise X ever performed" (stats, history, PRs).
create index workout_exercise_template_idx on workout_exercise (template_id);

create table workout_set (
  id                  uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercise (id) on delete cascade,
  position            integer not null check (position >= 0),
  set_type            set_type not null default 'normal',
  reps                integer check (reps >= 0),
  weight_kg           numeric(7, 3) check (weight_kg >= 0),
  duration_seconds    integer check (duration_seconds >= 0),
  distance_meters     integer check (distance_meters >= 0),
  rpe                 numeric(3, 1) check (rpe >= 1 and rpe <= 10),
  -- Extensible metrics sidecar (GPS track, steps, floors, machine-specific
  -- data) so a new machine type does not need a migration.
  metrics             jsonb not null default '{}',
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint workout_set_position_key
    unique (workout_exercise_id, position) deferrable initially deferred
);

create index workout_set_workout_exercise_idx on workout_set (workout_exercise_id, position);

comment on table workout_set is
  'Append-mostly result rows. Personal records, 1RM, volume, pace and muscle '
  'distribution are DERIVED from this table — never stored as source of truth.';

-- ===========================================================================
-- updated_at maintenance
-- ===========================================================================

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_user_touch_updated_at
  before update on app_user
  for each row execute function set_updated_at();
create trigger exercise_template_touch_updated_at
  before update on exercise_template
  for each row execute function set_updated_at();
create trigger routine_folder_touch_updated_at
  before update on routine_folder
  for each row execute function set_updated_at();
create trigger routine_touch_updated_at
  before update on routine
  for each row execute function set_updated_at();
create trigger routine_exercise_touch_updated_at
  before update on routine_exercise
  for each row execute function set_updated_at();
create trigger routine_set_touch_updated_at
  before update on routine_set
  for each row execute function set_updated_at();
create trigger workout_touch_updated_at
  before update on workout
  for each row execute function set_updated_at();
create trigger workout_exercise_touch_updated_at
  before update on workout_exercise
  for each row execute function set_updated_at();
create trigger workout_set_touch_updated_at
  before update on workout_set
  for each row execute function set_updated_at();

commit;
