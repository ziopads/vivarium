-- 2026-09-27c — Studio: releases (albums, EPs, singles, compilations).
--
-- SIRSINATE ONLY, after the earlier studio migrations. Purely additive, so it
-- can run before or after the deploy that uses it.
--
-- A release groups sessions (studio_projects) in a running order. Many-to-many:
-- a session can sit on an EP and later on a compilation, each with its own
-- position. The release plays each session's newest reference track.
--
-- ── Before ───────────────────────────────────────────────────────────────────
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name like 'studio_release%';
-- Expect zero rows.

begin;

create table if not exists studio_releases (
  id          bigint generated always as identity primary key,
  title       text not null check (title <> '' and title = btrim(title)),
  kind        text not null default 'album' check (kind in ('album', 'ep', 'single', 'compilation', 'other')),
  artist_id   bigint references studio_artists(id),   -- null: various / not decided
  year        int check (year is null or year between 1900 and 2200),
  notes       text not null default '',
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create table if not exists studio_release_tracks (
  release_id  bigint not null references studio_releases(id) on delete cascade,
  project_id  bigint not null references studio_projects(id) on delete cascade,
  position    int not null check (position > 0),
  primary key (release_id, project_id)
);
create index if not exists studio_release_tracks_project_idx on studio_release_tracks (project_id);

alter table studio_releases       enable row level security;
alter table studio_release_tracks enable row level security;

commit;

-- ── After ────────────────────────────────────────────────────────────────────
-- Expect two rows from the before-query.
