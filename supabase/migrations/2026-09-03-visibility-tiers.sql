-- 2026-09-03 — visibility becomes three tiers
--
-- Applied to: library (ziopads) 2026-09-03 — 30 records moved from 'restricted'
-- to 'admin'. NOT YET APPLIED to the Tamplin catalogue raisonné
-- (valerietamplin.com), which runs the same codebase against its own Supabase
-- project under a separate login. See supabase/migrations/README.md for the
-- instance table. Run this one BEFORE 2026-09-04-item-classification.sql.
--
-- WHAT CHANGES
--
-- `visibility` gains a middle tier. Stored values become:
--
--     public     anyone through the site gate        (UI label "Public")
--     signed_in  a viewer with a session             (UI label "Restricted")
--     admin      admins only                         (UI label "Private")
--
-- The stored values name who reaches a record and are deliberately NOT the
-- screen labels. The reason is this migration: a pre-2026-09-03 database stores
-- 'restricted' meaning ADMIN ONLY, while the label "Restricted" now belongs to
-- the middle tier. Had the labels been stored, this migration would have moved
-- every closed record down a tier — private books becoming visible to any
-- signed-in viewer, with nothing on screen to show it had happened.
--
-- ORDER: DEPLOY THE CODE FIRST, THEN RUN THIS.
--
-- lib/visibility.ts carries a LEGACY alias map ({restricted: 'admin', link:
-- 'signed_in'}) consulted before its public default, so between the deploy and
-- this migration the old rows keep exactly the meaning they have. There is no
-- window in which a record is more visible than it was.
--
-- Running this FIRST would leave the database holding values the deployed code
-- does not recognise, which fall through to the public default — publishing
-- every closed record until the deploy lands.
--
-- 'link' was the middle tier's name for a few hours on 2026-09-03 before it was
-- renamed. It is handled here in case any row was set during that window; on
-- most instances that statement affects nothing.
--
-- The CHECK constraint has to be dropped and rebuilt rather than altered: the
-- update cannot run while the old constraint forbids the new values, and the new
-- constraint cannot be added while rows still hold the old ones. Both happen
-- inside one transaction, so the column is never unguarded and any failure rolls
-- the whole thing back.
--
-- The new constraint deliberately EXCLUDES the legacy values. The application
-- normalizes on write and can only produce the three current ones, so permitting
-- 'restricted' would only let a stale client write a value the vocabulary no
-- longer has.

-- Before: know what you are changing.
--   select visibility, count(*) from items group by visibility order by visibility;

begin;

alter table items drop constraint if exists items_visibility_chk;

update items set visibility = 'admin'     where visibility = 'restricted';
update items set visibility = 'signed_in' where visibility = 'link';

alter table items
  add constraint items_visibility_chk
  check (visibility in ('public', 'signed_in', 'admin'));

commit;

-- After: expect only public / signed_in / admin, with the same total, and the
-- former 'restricted' count now sitting under 'admin'.
--   select visibility, count(*) from items group by visibility order by visibility;
--
-- Then hard-refresh /browse in list view and confirm the formerly closed records
-- read "Private" rather than "Restricted". Restricted on any of them would mean
-- they landed in the middle tier.
--
-- NOTE: `updated_at` is not touched by these statements, so those timestamps will
-- predate the migration. That is expected and is not evidence the rows are
-- unchanged.
