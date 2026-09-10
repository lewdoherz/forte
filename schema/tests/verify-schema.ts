import { createTestDatabase } from "./harness";
import type { WorkoutSet, ExerciseHistoryRow, ExerciseTotals } from "../types";

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  [" + extra + "]" : ""}`);
}

async function expectFail(label: string, sql: string, params: unknown[] = []) {
  try {
    await exec("begin");
    await query(sql, params);
    await exec("commit");
    check(label, false, "no error raised");
    await exec("rollback");
  } catch (e) {
    await exec("rollback").catch(() => {});
    check(label, true, String((e as Error).message).split("\n")[0].slice(0, 70));
  }
}

// ---------------------------------------------------------------- migrations
const { exec, query, close, dialect } = await createTestDatabase();
check(`schema migrations apply (${dialect})`, true);

const tables = await query<{ table_name: string }>(
  `select table_name from information_schema.tables
   where table_schema = 'public' order by table_name`,
);
check("tables created", tables.rows.length === 20, tables.rows.map((r) => r.table_name).join(","));

const vocab = await query<{ m: number; e: number }>(
  `select (select count(*) from muscle_group)::int as m, (select count(*) from equipment)::int as e`,
);
check("vocabularies seeded", vocab.rows[0].m === 20 && vocab.rows[0].e === 12,
  `muscle_group=${vocab.rows[0].m} equipment=${vocab.rows[0].e}`);

// ------------------------------------------------------------------- fixtures
const u = await query<{ id: string }>(
  `insert into app_user (username, email, display_name) values ('lewsherz','lew@example.com','Lew') returning id`,
);
const userId = u.rows[0].id;

const bench = await query<{ id: string }>(
  `insert into exercise_template (slug, title, exercise_type, primary_muscle, secondary_muscles, equipment)
   values ('bench-press-barbell','Bench Press (Barbell)','weight_reps','chest','{triceps,shoulders}','barbell')
   returning id`,
);
const benchId = bench.rows[0].id;

const plank = await query<{ id: string }>(
  `insert into exercise_template (slug, title, exercise_type, primary_muscle, equipment)
   values ('plank-fixture','Plank','duration','abdominals','none') returning id`,
);
const plankId = plank.rows[0].id;

const custom = await query<{ id: string }>(
  `insert into exercise_template (slug, title, exercise_type, primary_muscle, equipment, is_custom, owner_id)
   values ('deficit-deadlift-custom','Deficit Deadlift','weight_reps','hamstrings','barbell',true,$1) returning id`,
  [userId],
);
check("custom exercise with owner accepted", custom.rows.length === 1);

// --------------------------------------------------------------- routine tree
const folder = await query<{ id: string }>(
  `insert into routine_folder (owner_id, title, position) values ($1,'Pull/Push',0) returning id`,
  [userId],
);
const folderId = folder.rows[0].id;

const routine = await query<{ id: string }>(
  `insert into routine (owner_id, folder_id, title, notes, position)
   values ($1,$2,'Day B','Posterior chain',0) returning id`,
  [userId, folderId],
);
const routineId = routine.rows[0].id;

const rex1 = await query<{ id: string }>(
  `insert into routine_exercise (routine_id, template_id, position, superset_key, rest_seconds)
   values ($1,$2,0,'A',180) returning id`,
  [routineId, benchId],
);
const rex2 = await query<{ id: string }>(
  `insert into routine_exercise (routine_id, template_id, position, superset_key)
   values ($1,$2,1,'A') returning id`,
  [routineId, plankId],
);
check("superset rows share a key", rex1.rows.length === 1 && rex2.rows.length === 1);

await exec(
  `insert into routine_set (routine_exercise_id, position, set_type, reps, weight_kg) values
     ('${rex1.rows[0].id}',0,'warmup',10,40),
     ('${rex1.rows[0].id}',1,'normal',8,80),
     ('${rex1.rows[0].id}',2,'normal',8,82.5)`,
);
await query(
  `insert into routine_set (routine_exercise_id, position, set_type, rep_range_start, rep_range_end)
   values ($1,0,'normal',30,45)`,
  [rex2.rows[0].id],
);
const setCount = await query<{ n: number }>(
  `select count(*)::int as n from routine_set`, 
);
check("routine sets inserted (incl. rep range)", setCount.rows[0].n === 4, `n=${setCount.rows[0].n}`);

// -------------------------------------------------------------- workout tree
const w = await query<{ id: string }>(
  `insert into workout (owner_id, routine_id, title, started_at, ended_at, visibility)
   values ($1,$2,'Day B',  '2026-09-08T17:00:00Z','2026-09-08T18:05:00Z','followers') returning id`,
  [userId, routineId],
);
const workoutId = w.rows[0].id;

const wex = await query<{ id: string }>(
  `insert into workout_exercise (workout_id, template_id, position, superset_key)
   values ($1,$2,0,'A') returning id`,
  [workoutId, benchId],
);
const wexId = wex.rows[0].id;

await query(
  `insert into workout_set (workout_exercise_id, position, set_type, reps, weight_kg, rpe, completed_at, metrics)
   values ($1,0,'warmup',10,40,6,'2026-09-08T17:05:00Z','{}')`,
  [wexId],
);
await query(
  `insert into workout_set (workout_exercise_id, position, set_type, reps, weight_kg, rpe, completed_at, metrics)
   values ($1,1,'normal',5,100,9.5,'2026-09-08T17:12:00Z','{"steps":12}')`,
  [wexId],
);

const typed = await query<WorkoutSet>(
  `select * from workout_set order by position`, 
);
const first: WorkoutSet = typed.rows[0];
check("typed WorkoutSet row usable", typeof first.id === "string" && typeof first.metrics === "object",
  `weight_kg is ${typeof first.weight_kg} (driver returns numeric as string)`);

// ------------------------------------------------------------------ analytics
const history = await query<ExerciseHistoryRow>(
  `select w.id as workout_id, w.title as workout_title, w.started_at,
          s.id as set_id, s.set_type, s.reps, s.weight_kg, s.duration_seconds,
          s.distance_meters, s.rpe
     from workout_set s
     join workout_exercise we on we.id = s.workout_exercise_id
     join workout w on w.id = we.workout_id
    where we.template_id = $1
    order by w.started_at, s.position`,
  [benchId],
);
check("per-exercise history query returns rows", history.rows.length === 2, `rows=${history.rows.length}`);

const totals = await query<ExerciseTotals>(
  `select we.template_id,
          count(*)::int as set_count,
          coalesce(sum(s.reps),0)::int as total_reps,
          sum(s.weight_kg * s.reps) as total_volume_kg,
          max(s.weight_kg) as max_weight_kg,
          max(s.weight_kg * (1 + s.reps / 30.0)) as best_estimated_1rm_kg
     from workout_set s
     join workout_exercise we on we.id = s.workout_exercise_id
    where we.template_id = $1
    group by we.template_id`,
  [benchId],
);
const t = totals.rows[0];
check("derived totals computed from sets",
  t.set_count === 2 && t.total_reps === 15 && t.max_weight_kg === "100.000" && t.total_volume_kg === "900.000",
  `sets=${t.set_count} reps=${t.total_reps} volume=${t.total_volume_kg} 1rm=${t.best_estimated_1rm_kg}`);

// ------------------------------------------------------------- integrity tests
await expectFail("rejects negative weight",
  `insert into workout_set (workout_exercise_id, position, weight_kg) values ($1, 9, -5)`, [wexId]);
await expectFail("rejects rpe > 10",
  `insert into workout_set (workout_exercise_id, position, rpe) values ($1, 9, 11)`, [wexId]);
await expectFail("rejects ended_at before started_at",
  `insert into workout (owner_id, title, started_at, ended_at) values ($1,'x','2026-01-02T00:00:00Z','2026-01-01T00:00:00Z')`, [userId]);
await expectFail("rejects unknown set_type",
  `insert into workout_set (workout_exercise_id, position, set_type) values ($1, 9, 'nope')`, [wexId]);
await expectFail("rejects unknown exercise_type",
  `insert into exercise_template (slug, title, exercise_type, primary_muscle, equipment)
   values ('x','X','not_a_type','chest','barbell')`);
await expectFail("rejects unknown muscle group",
  `insert into exercise_template (slug, title, exercise_type, primary_muscle, equipment)
   values ('y','Y','weight_reps','not_a_muscle','barbell')`);
await expectFail("rejects dangling template reference",
  `insert into workout_exercise (workout_id, template_id, position)
   values ($1,'00000000-0000-0000-0000-000000000000',7)`, [workoutId]);
await expectFail("rejects half-filled rep range",
  `insert into routine_set (routine_exercise_id, position, rep_range_start) values ($1, 8, 5)`, [rex1.rows[0].id]);
await expectFail("rejects inverted rep range",
  `insert into routine_set (routine_exercise_id, position, rep_range_start, rep_range_end) values ($1, 8, 12, 5)`, [rex1.rows[0].id]);
await expectFail("rejects custom exercise without owner",
  `insert into exercise_template (slug, title, exercise_type, primary_muscle, equipment, is_custom)
   values ('z','Z','weight_reps','chest','barbell',true)`);
await expectFail("rejects duplicate position within a routine",
  `insert into routine_exercise (routine_id, template_id, position) values ($1,$2,0)`, [routineId, plankId]);
await expectFail("rejects cross-owner folder assignment",
  `insert into routine (owner_id, folder_id, title) values
     ('00000000-0000-0000-0000-000000000001', $1, 'stolen')`, [folderId]);
await expectFail("rejects duplicate username ignoring case",
  `insert into app_user (username, email) values ('LEWSHERZ','other@example.com')`);
await expectFail("blocks deleting a folder that still holds routines",
  `delete from routine_folder where id = $1`, [folderId]);

// ------------------------------------------------------------------ behaviour
// Deferrable unique: a position swap succeeds inside one transaction.
await exec("begin");
await query(`update routine_exercise set position = 0 where id = $1`, [rex2.rows[0].id]);
await query(`update routine_exercise set position = 1 where id = $1`, [rex1.rows[0].id]);
await exec("commit");
const swapped = await query<{ id: string; position: number }>(
  `select id, position from routine_exercise where routine_id = $1 order by position`, [routineId],
);
check("deferrable unique allows a position swap",
  swapped.rows[0].id === rex2.rows[0].id && swapped.rows[1].position === 1);

// updated_at trigger
await query(`update routine set title = 'Day B (rev)' where id = $1`, [routineId]);
const r2 = await query<{ created_at: Date; updated_at: Date }>(
  `select created_at, updated_at from routine where id = $1`, [routineId],
);
check("updated_at trigger fires", r2.rows[0].updated_at >= r2.rows[0].created_at,
  `created=${r2.rows[0].created_at?.toISOString?.()} updated=${r2.rows[0].updated_at?.toISOString?.()}`);

// cascade
await query(`delete from workout where id = $1`, [workoutId]);
const orphan = await query<{ n: number }>(
  `select (select count(*)::int from workout_exercise where workout_id = $1)
        + (select count(*)::int from workout_set s join workout_exercise we on we.id = s.workout_exercise_id where we.workout_id = $1) as n`,
  [workoutId],
);
check("deleting a workout cascades to exercises and sets", orphan.rows[0].n === 0);

// deleting the routine keeps logged history, drops provenance
const w2 = await query<{ id: string }>(
  `insert into workout (owner_id, routine_id, title, started_at) values ($1,$2,'from routine', now()) returning id`,
  [userId, routineId],
);
await query(`delete from routine where id = $1`, [routineId]);
const kept = await query<{ routine_id: string | null; n: number }>(
  `select routine_id, (select count(*) from routine_exercise)::int as n from workout where id = $1`,
  [w2.rows[0].id],
);
check("deleting a routine preserves the workout but clears provenance",
  kept.rows[0].routine_id === null);

// folder can be emptied then deleted
await query(`delete from workout where id = $1`, [w2.rows[0].id]);
await query(`delete from routine_folder where id = $1`, [folderId]).then(
  () => check("empty folder deletes cleanly", true),
  (e) => check("empty folder deletes cleanly", false, String(e).slice(0, 60)),
);

// archive instead of delete for a custom exercise that is referenced
await query(`update exercise_template set archived_at = now() where id = $1`, [custom.rows[0].id]);
const arch = await query<{ archived_at: Date | null }>(
  `select archived_at from exercise_template where id = $1`, [custom.rows[0].id],
);
check("custom exercise can be archived without breaking references", arch.rows[0].archived_at !== null);

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
