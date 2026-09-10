-- ---------------------------------------------------------------------------
-- 0006_user_timezone.sql — per-user IANA timezone preference
--
-- Instants are stored as timestamptz (absolute). Any conversion of an instant
-- into a calendar concept — a day boundary, a range lower bound, a rendered
-- date — must use the user's own zone, not the server's. Storing the zone as an
-- explicit preference (rather than inferring it from the browser per request)
-- keeps analytics bucketing stable and server-computable.
--
-- Default 'UTC' backfills existing rows and keeps the column total: consumers
-- never have to handle NULL.
--
-- IANA name validity is enforced in the application (lib/timezone.ts uses the
-- runtime's own Intl resolver, surfaced through zod). A CHECK constraint cannot
-- consult pg_timezone_names, and the timezone() function is only STABLE, so a
-- trigger would be required to enforce it here; the app is the only writer.
-- ---------------------------------------------------------------------------

begin;

alter table app_user
  add column timezone text not null default 'UTC';

-- Rejects blank/whitespace-only values and absurd lengths without restricting
-- legitimate IANA names (longest real name is 32 chars, e.g.
-- America/Argentina/ComodRivadavia).
alter table app_user
  add constraint app_user_timezone_shape_chk
  check (btrim(timezone) <> '' and char_length(timezone) <= 64);

comment on column app_user.timezone is
  'IANA timezone name (e.g. America/Chicago) used for all calendar bucketing '
  'and date rendering for this user. Validated in the application layer.';

commit;
