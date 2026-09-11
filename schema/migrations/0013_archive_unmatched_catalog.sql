-- ---------------------------------------------------------------------------
-- 0013_archive_unmatched_catalog.sql — retire catalog rows the library replaced
--
-- These predate the imported library and duplicate movements it already carries
-- under the source's own names: 'Barbell Back Squat' beside 'Squat (Barbell)',
-- 'Bench Press' beside 'Bench Press (Barbell)'. With the import in place they are
-- only clutter in the Library list.
--
-- Archived rather than deleted, and not out of caution in the abstract: each one
-- is referenced by logged workouts or routines, and the foreign keys are NO
-- ACTION, so a delete would not cascade — it would fail. Archiving removes them
-- from the Library (listExercises filters archived_at) while leaving every
-- reference intact, and clearing the column reverses it.
--
-- Deliberately not filtered in getVisibleExercise: those workouts link to these
-- rows, so their detail pages have to keep resolving.
--
-- Idempotent: only rows still unarchived are touched.
-- ---------------------------------------------------------------------------

begin;

update exercise_template
   set archived_at = now()
 where archived_at is null
   and is_custom = false
   and slug in (
  'back-squat',
  'barbell-curl',
  'barbell-row',
  'bench-press',
  'cable-fly',
  'deadlift',
  'farmers-carry',
  'incline-dumbbell-press',
  'lat-pulldown',
  'lateral-raise',
  'leg-curl',
  'leg-press',
  'overhead-press',
  'pull-up',
  'push-up',
  'romanian-deadlift'
   );

commit;
