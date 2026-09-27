-- 2026-09-26b — Studio: replace the project star with a 0–5 rating.
--
-- SIRSINATE ONLY, like 2026-09-26-studio.sql, which must already be applied.
-- (The "b" keeps this file sorting after that one: "26-studio.sql" and
-- "26-studio-rating.sql" would sort the wrong way round.)
--
-- One shared rating per project, 0 meaning unrated. Any existing star becomes
-- 5, so a project marked as a priority keeps sorting to the top.
--
-- ORDER RELATIVE TO THE DEPLOY: not additive. It drops `starred`, which the
-- phase-2 code reads, and adds `rating`, which the new code reads, so the studio
-- pages fail in whichever gap is left open. Push, let Vercel finish deploying,
-- then run this straight away. Only the studio section is affected; the
-- catalogue never touches these tables.
--
-- ── Before ───────────────────────────────────────────────────────────────────
--   select count(*) filter (where starred) as starred, count(*) as projects
--   from studio_projects;

begin;

alter table studio_projects
  add column if not exists rating smallint not null default 0 check (rating between 0 and 5);

update studio_projects set rating = 5 where starred;

alter table studio_projects drop column starred;

commit;

-- ── After ────────────────────────────────────────────────────────────────────
-- Expect the same project count, with the old starred count now at rating 5:
--
--   select rating, count(*) from studio_projects group by rating order by rating desc;
