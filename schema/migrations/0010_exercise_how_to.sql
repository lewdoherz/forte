-- ---------------------------------------------------------------------------
-- 0010_exercise_how_to.sql — per-exercise instructions on the catalog row
--
-- The curated catalog (0005) carries no instructions, and `media_url` only
-- points at a demonstration clip. The imported library ships a numbered
-- "How to" body with every movement, and the exercise page renders it beside
-- the exercise rather than in a separate table: it is one optional text blob
-- per template that is never filtered, joined or aggregated on.
--
-- Nullable on purpose: custom exercises and catalog rows created before this
-- migration have no instructions, and a template stays usable without them.
--
-- No muscle_group or equipment rows are added by this migration: the imported
-- library's vocabulary is already covered by 0002. Its equipment value "None"
-- is imported as the existing `bodyweight` code (the movement is performed
-- with no implement), and its single "Other" primary muscle maps to the
-- existing `other` code.
-- ---------------------------------------------------------------------------

begin;

alter table exercise_template
  add column how_to text;

comment on column exercise_template.how_to is
  'Free-form instructions (the imported library''s numbered "How to" body). '
  'Null when no instructions are available for the template.';

commit;
