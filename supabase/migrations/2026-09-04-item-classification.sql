-- 2026-09-04 — items get a classification path
--
-- Applied to: library (ziopads) 2026-09-04 — 1,740 of 1,905 records filed, 165
-- left null (unfiled, which is what null means here). NOT YET APPLIED to the
-- Tamplin catalogue raisonné (valerietamplin.com), which runs the same codebase
-- against its own Supabase project under a separate login. See
-- supabase/migrations/README.md for the instance table.
--
-- WHAT CHANGES
--
-- A `classification` column holding the record's full path into the
-- classification tree, separator-joined:
--
--     History & Place/Americas/Maine & New England
--
-- It becomes the authoritative statement of where a record is filed. `section`
-- and `shelf` stay, holding the path's first two segments, rewritten from it on
-- every save. Much of the app still reads them, and a two-segment path is the
-- common case worth indexing on its own.
--
-- ORDER: DEPLOY THE CODE FIRST, THEN RUN THIS.
--
-- validateItem builds a path from section and shelf whenever a record has none,
-- so between the deploy and this migration the app is writing a column that does
-- not exist yet — which Postgres rejects. Deploying first is therefore not
-- optional here in the way it was for the visibility rename: the writes fail
-- outright rather than degrading. Run this promptly after the deploy, and expect
-- saves to error in the gap.
--
-- (If that gap matters, run the migration first instead. The column is additive
-- and nullable, so a build that predates it simply never mentions it. The
-- backfill below is then the thing that has to wait, and it can run at any time.)
--
-- The backfill is the whole point: every existing record already states its
-- filing in section and shelf, so the path can be computed rather than entered.
-- Records with neither are left null, which is what unfiled means.

-- Before: how many records have something to backfill.
--   select count(*) filter (where coalesce(section,'') <> '') as with_section,
--          count(*) filter (where coalesce(shelf,'')   <> '') as with_shelf,
--          count(*)                                           as total
--   from items;

begin;

alter table items add column if not exists classification text;

-- concat_ws skips nulls but not empty strings, so the empties are nulled first.
-- A record with a shelf and no section would otherwise produce a path beginning
-- with the separator, which parses to a different tree position entirely.
update items
   set classification = nullif(
         concat_ws('/', nullif(section, ''), nullif(shelf, '')),
         ''
       )
 where classification is null;

-- text_pattern_ops so subtree queries — `classification LIKE 'History & Place/%'`,
-- which is what every telescoping column and every rolled-up count runs — can use
-- the index. A default btree would serve equality only.
create index if not exists items_classification_idx
    on items (classification text_pattern_ops);

commit;

-- After: every record with a section should now have a path, and the two should
-- agree on their first segment.
--   select count(*) as filed,
--          count(*) filter (where split_part(classification, '/', 1) <> section) as disagreeing
--   from items
--   where classification is not null;
--
-- `disagreeing` must be zero. Anything else means a section name contains the
-- separator, which the vocabulary editor forbids but older data may not have.
--
-- Spot-check a nested one:
--   select id, title, classification, section, shelf from items
--    where classification like '%/%' limit 20;
