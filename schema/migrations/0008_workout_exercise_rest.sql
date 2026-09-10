-- ---------------------------------------------------------------------------
-- 0008_workout_exercise_rest.sql — snapshot the rest target onto the workout
--
-- `routine_exercise.rest_seconds` already holds the planned rest, but until now
-- it stopped at the routine: a started workout had nowhere to carry it, so the
-- logger could not offer a rest timer.
--
-- The value is COPIED here rather than joined back through `workout.routine_id`.
-- A started workout must stay self-contained — the same reason title, notes,
-- planned sets and superset_key are all snapshotted at start. Reading the rest
-- target back from the routine would make an in-progress workout change the
-- moment someone edited the routine it came from.
--
-- Nullable on purpose: rest is optional, and rows created before this migration
-- have no rest target. The check mirrors routine_exercise's.
-- ---------------------------------------------------------------------------

begin;

alter table workout_exercise
  add column rest_seconds integer;

alter table workout_exercise
  add constraint workout_exercise_rest_seconds_chk check (rest_seconds >= 0);

comment on column workout_exercise.rest_seconds is
  'Rest target in seconds, snapshotted from routine_exercise at start. Null when '
  'the exercise has no planned rest, or for workouts started before 0008.';

commit;
