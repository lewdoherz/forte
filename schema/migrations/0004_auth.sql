-- ---------------------------------------------------------------------------
-- 0004_auth.sql — Better Auth core tables (email/password) mapped onto app_user
--
-- Better Auth's `user` model is mapped onto the existing `app_user` table so a
-- single identity is shared: Better Auth user.id == app_user.id == owner_id /
-- user_id throughout the application. This migration:
--   1. makes username nullable (collected later during profile onboarding);
--   2. adds email_verified (Better Auth's emailVerified flag);
--   3. creates the three Better-Auth-owned tables (session, account,
--      verification) with uuid ids and snake_case columns.
--
-- Applied by our own runner (scripts/migrate.ts). Better Auth's migrator is
-- never run. Timestamps on the auth tables are written by Better Auth itself,
-- so no set_updated_at() trigger is attached here.
-- ---------------------------------------------------------------------------

begin;

-- username becomes optional. The existing unique index on lower(username)
-- already permits multiple NULLs, so "unique when present" holds unchanged.
alter table app_user alter column username drop not null;

-- Better Auth emailVerified flag.
alter table app_user add column email_verified boolean not null default false;

-- Better Auth session: one row per active browser/device session.
create table session (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user (id) on delete cascade,
  token      text not null,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index session_token_key on session (token);
create index session_user_idx on session (user_id);

comment on table session is
  'Better Auth session. token is the hashed session token; user_id is '
  'app_user.id (uuid), so an authenticated session maps directly onto '
  'application ownership.';

-- Better Auth account: one row per authentication method linked to a user.
create table account (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references app_user (id) on delete cascade,
  account_id               text not null,
  provider_id              text not null,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  password                 text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index account_user_idx on account (user_id);

comment on table account is
  'Better Auth account. For email/password the provider_id is ''credential'' '
  'and password holds the scrypt hash. OAuth providers (later) add one row '
  'each.';

-- Better Auth verification: short-lived tokens (email verification, password
-- reset, etc.). Unused while only email/password is enabled.
create table verification (
  id         uuid primary key default gen_random_uuid(),
  identifier text not null,
  value      text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table verification is
  'Better Auth verification records. Present so the schema matches Better '
  'Auth''s core tables; empty until email flows are enabled.';

commit;
