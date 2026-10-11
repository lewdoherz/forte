-- ---------------------------------------------------------------------------
-- 0016_localization.sql — interface language, and Chinese catalog vocabulary
--
-- Two things are added here, and they are separate concerns:
--
-- 1. `app_user.locale` — the language an account reads the interface in. It is
--    stored rather than left to a cookie alone because transactional email
--    (verification, password reset, account lifecycle) is sent from a
--    background task, where there is no request and therefore no cookie. The
--    cookie remains the faster path for rendering; this column is what mail
--    follows, and what a reader's choice survives on a device they have never
--    signed in from.
--
-- 2. `*_zh` columns on the vocabulary tables — Simplified Chinese display names
--    for muscle groups and equipment. The English `display_name` stays the
--    source of truth, the fallback, and the value the public API documents; a
--    reader of Chinese sees the translation when one exists and English when
--    the term has no established translation yet.
--
-- Deliberately NOT done here: translating the exercise catalog itself. That is
-- data, not schema, and it is large enough to belong in its own migration
-- (0017) so this one stays reviewable. Custom exercises a reader creates are
-- never translated — they have no `*_zh` value and fall back to their own title.
--
-- Idempotent: `add column if not exists` plus upserts keyed on code.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- Interface language
-- ---------------------------------------------------------------------------

alter table app_user
  add column if not exists locale text not null default 'en';

comment on column app_user.locale is
  'BCP 47 tag of the account''s interface language. ''en'' or ''zh-CN''. Owns '
  'the language of outgoing transactional email; the forte_locale cookie is the '
  'rendering fast path and is kept in step with this value.';

-- The check constraint is added separately so re-running on a database that
-- already has the column still succeeds. Only the tags the dictionaries carry
-- are accepted: a language with no dictionary would render every key as its own
-- name, which is worse than refusing the value.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_user_locale_check'
  ) then
    alter table app_user
      add constraint app_user_locale_check check (locale in ('en', 'zh-CN'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Muscle groups
-- ---------------------------------------------------------------------------

alter table muscle_group
  add column if not exists display_name_zh text;

comment on column muscle_group.display_name_zh is
  'Simplified Chinese name. Null falls back to display_name.';

insert into muscle_group (code, display_name, display_name_zh, sort_order) values
  ('chest',      'Chest',       '胸肌',     10),
  ('upper_back', 'Upper Back',  '上背',     20),
  ('lats',       'Lats',        '背阔肌',   30),
  ('lower_back', 'Lower Back',  '下背',     40),
  ('traps',      'Traps',       '斜方肌',   50),
  ('shoulders',  'Shoulders',   '肩部',     60),
  ('biceps',     'Biceps',      '肱二头肌', 70),
  ('triceps',    'Triceps',     '肱三头肌', 80),
  ('forearms',   'Forearms',    '前臂',     90),
  ('abdominals', 'Abdominals',  '腹部',    100),
  ('quadriceps', 'Quadriceps',  '股四头肌', 110),
  ('hamstrings', 'Hamstrings',  '腘绳肌',   120),
  ('glutes',     'Glutes',      '臀部',    130),
  ('calves',     'Calves',      '小腿',    140),
  ('adductors',  'Adductors',   '内收肌',  150),
  ('abductors',  'Abductors',   '外展肌',  160),
  ('neck',       'Neck',        '颈部',    170),
  ('cardio',     'Cardio',      '有氧',    180),
  ('full_body',  'Full Body',   '全身',    190),
  ('other',      'Other',       '其他',    999)
on conflict (code) do update
  set display_name_zh = excluded.display_name_zh;

-- ---------------------------------------------------------------------------
-- Equipment
-- ---------------------------------------------------------------------------

alter table equipment
  add column if not exists display_name_zh text;

comment on column equipment.display_name_zh is
  'Simplified Chinese name. Null falls back to display_name.';

insert into equipment (code, display_name, display_name_zh, sort_order) values
  ('barbell',         'Barbell',          '杠铃',     10),
  ('dumbbell',        'Dumbbell',         '哑铃',     20),
  ('machine',         'Machine',          '固定器械', 30),
  ('cable',           'Cable',            '绳索',     40),
  ('kettlebell',      'Kettlebell',       '壶铃',     50),
  ('plate',           'Plate',            '杠铃片',   60),
  ('resistance_band', 'Resistance Band',  '弹力带',   70),
  ('suspension',      'Suspension',       '悬吊带',   80),
  ('smith_machine',   'Smith Machine',    '史密斯机', 90),
  ('bodyweight',      'Bodyweight',       '自重',    100),
  ('none',            'None',             '无',      900),
  ('other',           'Other',            '其他',    999)
on conflict (code) do update
  set display_name_zh = excluded.display_name_zh;

-- ---------------------------------------------------------------------------
-- Exercise catalog translation columns
-- ---------------------------------------------------------------------------

alter table exercise_template
  add column if not exists title_zh text;

alter table exercise_template
  add column if not exists how_to_zh text;

comment on column exercise_template.title_zh is
  'Simplified Chinese title. Null (all custom exercises, and any catalog row '
  'without a translation) falls back to title.';

comment on column exercise_template.how_to_zh is
  'Simplified Chinese instructions, mirroring the structure of how_to. Null '
  'falls back to how_to.';

commit;
