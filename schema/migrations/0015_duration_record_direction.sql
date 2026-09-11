-- ---------------------------------------------------------------------------
-- 0015_duration_record_direction.sql — which way a duration is a record
--
-- A timed exercise (a plank, a run, a hold) records progress in one of two
-- directions: longer is better, or shorter is better. Which one it is lives on
-- the exercise because it is a property of the movement, not of the set — a
-- 5 km run improves by going faster, a dead hang by hanging longer.
--
-- Deliberately NOT a generic `record_direction`. The other exercise types mix
-- comparison directions among their own categories (weight_reps is heavier AND
-- more reps AND more volume; bodyweight_assisted is LOWER assistance while
-- every other type counts upwards), so one per-exercise direction would be
-- wrong for them. Only `duration` has a single, user-meaningful direction to
-- choose, and `none` lets a timed exercise opt out of duration records
-- entirely (e.g. mobility work where "longest" is meaningless).
--
-- Not null with a 'higher' default: 'higher' is the motion that needs no
-- configuration — a longer plank is the obvious record — and every existing row
-- reads that way without a backfill. `duration_record_direction` is added at
-- the end of the row, so the default is a metadata-only change on PostgreSQL 11+.
-- ---------------------------------------------------------------------------

begin;

create type duration_record_direction as enum ('higher', 'lower', 'none');

alter table exercise_template
  add column duration_record_direction duration_record_direction not null default 'higher';

comment on column exercise_template.duration_record_direction is
  'Which duration is a record for this exercise: higher (longer, the default), '
  'lower (shorter), or none (no duration records). Read only for exercise_type '
  'duration; other types derive their own per-category directions.';

commit;
