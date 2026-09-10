-- ---------------------------------------------------------------------------
-- 0009_rate_limit.sql — persistent storage for Better Auth's rate limiter
--
-- Better Auth rate limits by default in production, but its default store is
-- in-process: limits reset on every deploy and are not shared between instances.
-- Setting `rateLimit.storage = "database"` (lib/auth.ts) moves them here.
--
-- Better Auth only expects this table when that setting is on, and its adapter is
-- told the column names explicitly, so the snake_case naming used everywhere else
-- in this schema is preserved via the `fields` mapping rather than by renaming
-- anything here.
--
-- Shape mirrors Better Auth's `rateLimit` model: a unique key (client + path),
-- a hit count, and the epoch-millisecond timestamp of the last hit. The `id`
-- column carries a default because the model declares no id field, so inserts may
-- omit it.
-- ---------------------------------------------------------------------------

begin;

create table rate_limit (
  id           uuid primary key default gen_random_uuid(),
  key          text not null,
  count        integer not null,
  last_request bigint not null,

  -- One row per client+path bucket; the limiter reads, then increments, by key.
  constraint rate_limit_key_key unique (key)
);

comment on table rate_limit is
  'Better Auth rate-limit buckets (client key + path). Rows are disposable: the '
  'limiter expires them by last_request, so this table holds only recent traffic.';

commit;
