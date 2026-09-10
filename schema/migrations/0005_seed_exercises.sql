-- ---------------------------------------------------------------------------
-- 0005_seed_exercises.sql — a small curated catalog of system exercises.
--
-- These are standard, generic movements (the fitness-domain vocabulary is not
-- proprietary). is_custom defaults to false and owner_id to null, so these are
-- global library rows shared by every user. Idempotent: re-running skips
-- existing slugs.
-- ---------------------------------------------------------------------------

begin;

insert into exercise_template (slug, title, exercise_type, primary_muscle, secondary_muscles, equipment) values
  ('bench-press',          'Bench Press',            'weight_reps',    'chest',      '{triceps,shoulders}',            'barbell'),
  ('incline-dumbbell-press','Incline Dumbbell Press', 'weight_reps',   'chest',      '{shoulders,triceps}',            'dumbbell'),
  ('push-up',              'Push-Up',                'bodyweight_reps','chest',      '{triceps,shoulders}',            'bodyweight'),
  ('cable-fly',            'Cable Fly',              'weight_reps',    'chest',      '{}',                             'cable'),
  ('barbell-row',          'Barbell Row',            'weight_reps',    'upper_back', '{lats,biceps}',                  'barbell'),
  ('pull-up',              'Pull-Up',                'bodyweight_reps','lats',       '{biceps,upper_back}',            'bodyweight'),
  ('lat-pulldown',         'Lat Pulldown',           'weight_reps',    'lats',       '{biceps}',                       'cable'),
  ('deadlift',             'Deadlift',               'weight_reps',    'lower_back', '{hamstrings,glutes,traps}',      'barbell'),
  ('back-squat',           'Barbell Back Squat',     'weight_reps',    'quadriceps', '{glutes,hamstrings,lower_back}', 'barbell'),
  ('leg-press',            'Leg Press',              'weight_reps',    'quadriceps', '{glutes}',                       'machine'),
  ('romanian-deadlift',    'Romanian Deadlift',      'weight_reps',    'hamstrings', '{glutes,lower_back}',            'barbell'),
  ('leg-curl',             'Leg Curl',               'weight_reps',    'hamstrings', '{}',                             'machine'),
  ('standing-calf-raise',  'Standing Calf Raise',    'weight_reps',    'calves',     '{}',                             'machine'),
  ('overhead-press',       'Overhead Press',         'weight_reps',    'shoulders',  '{triceps}',                      'barbell'),
  ('lateral-raise',        'Lateral Raise',          'weight_reps',    'shoulders',  '{}',                             'dumbbell'),
  ('face-pull',            'Face Pull',              'weight_reps',    'shoulders',  '{upper_back}',                   'cable'),
  ('barbell-curl',         'Barbell Curl',           'weight_reps',    'biceps',     '{forearms}',                     'barbell'),
  ('triceps-pushdown',     'Triceps Pushdown',       'weight_reps',    'triceps',    '{}',                             'cable'),
  ('plank',                'Plank',                  'duration',       'abdominals', '{}',                             'bodyweight'),
  ('crunch',               'Crunch',                 'reps_only',      'abdominals', '{}',                             'bodyweight'),
  ('hip-thrust',           'Hip Thrust',             'weight_reps',    'glutes',     '{hamstrings}',                   'barbell'),
  ('walking-lunge',        'Walking Lunge',          'bodyweight_reps','quadriceps', '{glutes,hamstrings}',            'bodyweight'),
  ('goblet-squat',         'Goblet Squat',           'weight_reps',    'quadriceps', '{glutes}',                       'kettlebell'),
  ('farmers-carry',        'Farmer''s Carry',         'duration',       'forearms',   '{traps}',                        'dumbbell')
on conflict (slug) do nothing;

commit;
