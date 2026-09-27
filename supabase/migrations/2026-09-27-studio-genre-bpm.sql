-- 2026-09-27 — Studio: genre and BPM on projects.
--
-- SIRSINATE ONLY, after 2026-09-26-studio.sql and 2026-09-26b-studio-rating.sql.
--
-- Purely additive (two new columns with defaults), so it can run before or
-- after the deploy that uses them. Run it before any project import that sets
-- bpm.
--
-- genre  free text for now; '' means not set. The list page filters on the
--        distinct values in use, so consistent spelling keeps the filter tidy.
-- bpm    decimal, because half-time and odd tempos exist (127.5); null means
--        not set. The range check refuses typos rather than policing style.
--
-- ── Before ───────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--   where table_name = 'studio_projects' and column_name in ('genre', 'bpm');
-- Expect zero rows.

begin;

alter table studio_projects
  add column if not exists genre text not null default '',
  add column if not exists bpm   numeric(5,2) check (bpm is null or bpm between 20 and 400);

commit;

-- ── After ────────────────────────────────────────────────────────────────────
-- Expect two rows from the before-query.
