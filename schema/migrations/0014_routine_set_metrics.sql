-- ---------------------------------------------------------------------------
-- 0014_routine_set_metrics.sql — prescribable floors and steps on a planned set
--
-- Every result metric has a prescribed counterpart on routine_set except the
-- two "count of something" types: floors_duration and steps_duration could
-- only carry their duration. The completed-workout side has carried both in
-- workout_set.metrics (jsonb) since 0001 — a sidecar for metrics that are not
-- worth a column each, because they are read and written whole and never
-- filtered, joined or aggregated on.
--
-- Mirroring that column here is what keeps a prescription and its result the
-- same shape: `SetMetrics` in schema/types.ts is the one declaration both read,
-- and the routine editor renders the same fields the logger does. A future
-- metric (geospatial, already declared) then needs no migration on either side.
--
-- Not null with an empty-object default, exactly like workout_set.metrics: a
-- set of a type that uses no sidecar metric reads as a valid empty SetMetrics
-- rather than null, and rows written before this migration read the same way.
-- ---------------------------------------------------------------------------

begin;

alter table routine_set
  add column metrics jsonb not null default '{}';

comment on column routine_set.metrics is
  'Prescribed per-set sidecar metrics (steps, floors), mirroring '
  'workout_set.metrics. Empty object when the exercise type uses none.';

commit;
