-- Sirsinate studio roster and starting genres — run on the Sirsinate database
-- after the studio migrations (the genre insert needs studio_genres, from
-- 2026-09-27b-studio-genres.sql or a fresh schema.sql).
--
-- Seed data, not schema: it belongs to one instance, so it lives here rather
-- than in migrations/ (which every instance runs) or schema.sql (which every
-- fresh install runs).
--
-- Safe to re-run: existing artists and members are left as they are. To change
-- someone's artist later, update studio_members directly.
--
-- Adding a member here does NOT let them in. Studio access is AUTH_ALLOWLIST /
-- AUTH_ADMINS on the Vercel project; this table only decides which artist code
-- their notes and uploads show.

begin;

insert into studio_artists (code, name) values
  ('KR',  'Kamikaze Rabbit'),
  ('VIG', 'Vigorish'),
  ('KJI', 'Kawaji'),
  ('ASU', 'All-Star Underachievers')
on conflict (code) do nothing;

insert into studio_members (email, artist_id)
select v.email, a.id
from (values
  ('ziopads@gmail.com',          'VIG'),
  ('gordonm@gmail.com',          'KJI'),
  ('chrisfiveonesix@icloud.com', 'KR')
) as v(email, code)
join studio_artists a on a.code = v.code
on conflict (email) do nothing;

insert into studio_genres (name)
select v.name from (values ('ambient'), ('downtempo'), ('experimental'), ('techno'), ('electronic')) as v(name)
where not exists (select 1 from studio_genres g where lower(g.name) = lower(v.name));

commit;

-- Expect four artists and three members:
--
--   select a.code, a.name, m.email
--   from studio_artists a left join studio_members m on m.artist_id = a.id
--   order by a.code;
