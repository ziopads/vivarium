-- 2026-09-26 — Studio: artists, members, projects, reference tracks, notes.
--
-- SIRSINATE ONLY. These tables back the studio section (lib/instance.ts
-- `studio: true`), which only the Sirsinate instance turns on. Library and
-- Tamplin can skip this file: their code never queries these tables, and the
-- fresh-install schema.sql creates them empty anyway.
--
-- Purely additive — new tables, one function, one trigger. Nothing existing is
-- touched, so it is safe to run before or after the deploy that uses it.
--
-- After it succeeds, run supabase/seeds/sirsinate-studio.sql to load the roster.
--
-- ── Before ───────────────────────────────────────────────────────────────────
-- Expect zero rows (no studio tables yet):
--
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name like 'studio_%';

begin;

-- The roster. An artist is an act on the label; it may be one person (KR, VIG,
-- KJI) or a collaboration with no member of its own (ASU).
create table if not exists studio_artists (
  id    bigint generated always as identity primary key,
  code  text not null unique,   -- short label code: KR, VIG, KJI, ASU
  name  text not null unique
);

-- Which artist a signed-in person appears as on notes and uploads. This is
-- display only: whether someone may use the studio at all is AUTH_ALLOWLIST /
-- AUTH_ADMINS, checked in middleware. Emails are stored lowercased, matching
-- how lib/auth.ts compares them.
create table if not exists studio_members (
  email      text primary key check (email = lower(email)),
  artist_id  bigint not null references studio_artists(id)
);

-- A project is one Ableton set. `canonical_id` is the name of its folder on
-- disk (usually a date, '2026 0926'), and it is PERMANENT: renaming the folder
-- breaks Ableton's file associations, so the record must never drift from it.
-- The trigger below enforces that at the database, so no route, script or
-- dashboard edit can change it. `working_name` is free to change; each change
-- is kept in studio_project_names.
--
-- Unique per artist, not globally: two artists can each start a project on the
-- same day. A second one for the same artist and day takes a suffix
-- ('2026 0926b').
create table if not exists studio_projects (
  id            bigint generated always as identity primary key,
  artist_id     bigint not null references studio_artists(id),
  canonical_id  text not null check (canonical_id <> '' and canonical_id = btrim(canonical_id)),
  working_name  text not null default '',
  starred       boolean not null default false,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  unique (artist_id, canonical_id)
);
create index if not exists studio_projects_artist_idx on studio_projects (artist_id);

create or replace function studio_projects_lock_canonical() returns trigger
language plpgsql as $body$
begin
  if new.canonical_id is distinct from old.canonical_id then
    raise exception 'studio_projects.canonical_id is permanent (project %: "%" cannot become "%")',
      old.id, old.canonical_id, new.canonical_id;
  end if;
  return new;
end;
$body$;

drop trigger if exists studio_projects_lock_canonical on studio_projects;
create trigger studio_projects_lock_canonical
  before update of canonical_id on studio_projects
  for each row execute function studio_projects_lock_canonical();

-- Every working name a project has had, including the first. Old notes and old
-- MP3 filenames use earlier names, so this is how you find a project by them.
create table if not exists studio_project_names (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references studio_projects(id) on delete cascade,
  name        text not null,
  set_by      text not null,
  set_at      timestamptz not null default now()
);
create index if not exists studio_project_names_project_idx on studio_project_names (project_id, set_at desc);

-- One row per reference MP3. The audio lives in the private R2 audio bucket
-- under `r2_key`; this row is the record of it. `version` counts up per
-- project; the unique constraint turns a race between two simultaneous uploads
-- into an error the route can retry, instead of two files sharing a number.
create table if not exists studio_tracks (
  id                 bigint generated always as identity primary key,
  project_id         bigint not null references studio_projects(id) on delete cascade,
  version            int not null check (version > 0),
  r2_key             text not null unique,
  original_filename  text not null,
  bytes              bigint,
  duration_s         real,
  uploaded_by        text not null,
  uploaded_at        timestamptz not null default now(),
  unique (project_id, version)
);

-- A note belongs to a project and may point at one reference track ("about
-- v3"). Deleting that track keeps the note and drops the pointer.
create table if not exists studio_notes (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references studio_projects(id) on delete cascade,
  track_id    bigint references studio_tracks(id) on delete set null,
  author      text not null,
  body        text not null check (btrim(body) <> ''),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index if not exists studio_notes_project_idx on studio_notes (project_id, created_at desc);

-- Same stance as items/vocab/wishlist: server-side access only, through the
-- service-role key after an auth check. RLS on with no policies = the anon key
-- can neither read nor write these tables.
alter table studio_artists        enable row level security;
alter table studio_members        enable row level security;
alter table studio_projects       enable row level security;
alter table studio_project_names  enable row level security;
alter table studio_tracks         enable row level security;
alter table studio_notes          enable row level security;

commit;

-- ── After ────────────────────────────────────────────────────────────────────
-- Expect six rows:
--
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name like 'studio_%'
--   order by table_name;
--
-- Then prove the lock (expect an error naming the permanent canonical_id; the
-- rollback leaves nothing behind):
--
--   begin;
--   insert into studio_artists (code, name) values ('ZZ', 'Lock test');
--   insert into studio_projects (artist_id, canonical_id, created_by)
--     select id, '1999 0101', 'test' from studio_artists where code = 'ZZ';
--   update studio_projects set canonical_id = '1999 0102' where canonical_id = '1999 0101';
--   rollback;
