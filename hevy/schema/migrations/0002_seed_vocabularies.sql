-- ---------------------------------------------------------------------------
-- 0002_seed_vocabularies.sql — canonical muscle groups and equipment
--
-- Values are the documented public-API enums (snake_case). The lookup tables
-- are data-driven on purpose: adding a code is a data change, not a migration.
--
-- Idempotent: safe to re-run (upsert by code).
-- ---------------------------------------------------------------------------

begin;

insert into muscle_group (code, display_name, sort_order) values
  ('chest',      'Chest',       10),
  ('upper_back', 'Upper Back',  20),
  ('lats',       'Lats',        30),
  ('lower_back', 'Lower Back',  40),
  ('traps',      'Traps',       50),
  ('shoulders',  'Shoulders',   60),
  ('biceps',     'Biceps',      70),
  ('triceps',    'Triceps',     80),
  ('forearms',   'Forearms',    90),
  ('abdominals', 'Abdominals', 100),
  ('quadriceps', 'Quadriceps', 110),
  ('hamstrings', 'Hamstrings', 120),
  ('glutes',     'Glutes',     130),
  ('calves',     'Calves',     140),
  ('adductors',  'Adductors',  150),
  ('abductors',  'Abductors',  160),
  ('neck',       'Neck',       170),
  ('cardio',     'Cardio',     180),
  ('full_body',  'Full Body',  190),
  ('other',      'Other',      999)
on conflict (code) do update
  set display_name = excluded.display_name,
      sort_order   = excluded.sort_order;

insert into equipment (code, display_name, sort_order) values
  ('barbell',         'Barbell',          10),
  ('dumbbell',        'Dumbbell',         20),
  ('machine',         'Machine',          30),
  ('cable',           'Cable',            40),
  ('kettlebell',      'Kettlebell',       50),
  ('plate',           'Plate',            60),
  ('resistance_band', 'Resistance Band',  70),
  ('suspension',      'Suspension',       80),
  ('smith_machine',   'Smith Machine',    90),
  ('bodyweight',      'Bodyweight',      100),
  ('none',            'None',            900),
  ('other',           'Other',           999)
on conflict (code) do update
  set display_name = excluded.display_name,
      sort_order   = excluded.sort_order;

commit;
