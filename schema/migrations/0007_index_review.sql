-- ---------------------------------------------------------------------------
-- 0007_index_review.sql — indexes justified by measurement, not speculation
--
-- Every index below was validated with EXPLAIN (ANALYZE, BUFFERS) on a real
-- PostgreSQL 18 instance against a scale-realistic dataset (206k workouts,
-- 720k sets, 30 users, ~2 years of history), comparing plan shape, rows
-- removed by filter and buffer counts against a negative control with the
-- index dropped. Candidates that produced no plan-shape change were rejected;
-- notably NO covering/partial index on workout_set or workout_exercise was
-- justified — the existing indexes already serve those access paths.
-- ---------------------------------------------------------------------------

begin;

-- 1. Progress analytics — lib/progress.ts getCompletedSetRows.
--
-- Measured without it: the unbounded join chose a Merge Join whose outer input
-- was an UNFILTERED `Index Scan using workout_pkey`, removing 203,002 rows by
-- filter and touching 3,962 buffers on that node alone (6,689 total). The cost
-- grew with total workouts in the system, not with the requesting user's data.
-- With it the planner uses `Index Cond: owner_id`: 69 buffers on that node,
-- 2,796 total. Must be the plain index — a partial `where ended_at is not null`
-- variant behaves identically at the same size, and `(owner_id, started_at, id)`
-- is ignored entirely because the merge join needs `id` order.
create index workout_owner_id_idx on workout (owner_id, id);

-- 2. History list (lib/workouts.ts listWorkouts) and the active-workout lookup
--    (getActiveWorkout, called from app/(app)/layout.tsx on EVERY protected
--    page render).
--
-- Measured without it: listWorkouts fetched 3,123 heap blocks (3,481 buffers)
-- merely to sort and keep 50 rows, because `(ended_at is null)` is the leading
-- sort key and `(owner_id, started_at desc)` cannot serve it; with it the scan
-- is ordered and stops after 50 rows (411 buffers). getActiveWorkout went from
-- a bitmap scan of every one of the user's 3,002 workout rows (69 buffers) to
-- 4 buffers with `Index Cond: ((ended_at IS NULL) = true)`.
--
-- The expression matches the ORDER BY the application issues
-- (`ended_at is null desc, started_at desc`).
create index workout_history_idx
  on workout (owner_id, (ended_at is null) desc, started_at desc);

commit;
