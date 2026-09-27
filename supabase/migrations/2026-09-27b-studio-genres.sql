-- 2026-09-27b — Studio: a fixed, extendable genre list.
--
-- SIRSINATE ONLY, after 2026-09-27-studio-genre-bpm.sql.
--
-- studio_projects.genre was free text. It becomes a reference to
-- studio_genres(name), so a project can only carry a genre on the list, and
-- the list page can filter on it without near-duplicates ("Techno", "techno ").
-- Any studio member can add a genre from the app. Names are unique regardless
-- of case. ON UPDATE CASCADE means renaming a genre here renames it on every
-- project that uses it.
--
-- Not set is now NULL (was ''), because a foreign key accepts NULL but not ''.
-- The app maps NULL back to '' so nothing downstream changes.
--
-- Any genre already typed on a project that is not one of the five is added to
-- the list rather than lost.
--
-- ORDER RELATIVE TO THE DEPLOY: run this first, then deploy. The current code
-- writes '' to clear a genre, which this file's foreign key would reject, but
-- the current code also only reads `genre` as text, which keeps working. The
-- new code writes NULL and reads the list from studio_genres, which must exist.
--
-- ── Before ───────────────────────────────────────────────────────────────────
--   select genre, count(*) from studio_projects group by genre order by 2 desc;

begin;

create table if not exists studio_genres (
  id    bigint generated always as identity primary key,
  name  text not null unique check (name <> '' and name = btrim(name))
);
create unique index if not exists studio_genres_name_ci on studio_genres (lower(name));
alter table studio_genres enable row level security;

insert into studio_genres (name)
select v.name from (values ('ambient'), ('downtempo'), ('experimental'), ('techno'), ('electronic')) as v(name)
where not exists (select 1 from studio_genres g where lower(g.name) = lower(v.name));

-- Keep whatever was typed before the list existed.
insert into studio_genres (name)
select distinct btrim(p.genre) from studio_projects p
where btrim(p.genre) <> ''
  and not exists (select 1 from studio_genres g where lower(g.name) = lower(btrim(p.genre)));

-- Point typed values at the list's own spelling, and '' at NULL.
update studio_projects p set genre = g.name
from studio_genres g
where btrim(p.genre) <> '' and lower(g.name) = lower(btrim(p.genre)) and p.genre <> g.name;

alter table studio_projects alter column genre drop not null;
alter table studio_projects alter column genre drop default;
update studio_projects set genre = null where genre = '';

alter table studio_projects
  add constraint studio_projects_genre_fkey
  foreign key (genre) references studio_genres (name) on update cascade;

commit;

-- ── After ────────────────────────────────────────────────────────────────────
--   select name from studio_genres order by name;
-- Expect at least the five, plus anything that had been typed.
