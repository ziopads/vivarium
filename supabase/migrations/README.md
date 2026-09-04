# Migrations

`supabase/schema.sql` is the fresh-install schema and always describes the
current shape. A brand-new instance runs that file and needs nothing in here.

This directory is for databases that **already exist**. Each file is a dated,
self-contained change to be run in the Supabase SQL editor, in filename order,
starting after whatever version the database was created from.

Every schema change belongs in both places: edit `schema.sql` so new instances
get it, and add a file here so the instances already deployed can catch up.
Editing only `schema.sql` is the failure mode — a fresh install works, and the
running instances break on their first write.

## Instances

| Instance | Supabase account | 2026-09-03 visibility | 2026-09-04 classification |
|---|---|---|---|
| Library (James's books) | ziopads | applied 2026-09-03 | applied 2026-09-04 — 1,740 of 1,905 filed |
| Tamplin catalogue raisonné (valerietamplin.com) | separate valerietamplin login | **not applied** | **not applied** |

The Tamplin instance was created from an earlier `schema.sql` and runs the same
codebase, so it needs each migration here applied to its own project, in date
order. Its Supabase lives under a different login — check which project you have
open before running anything.

### Applying to the Tamplin instance

Both files are outstanding there, and they must go in date order: the visibility
rename first, then the classification column. Running them out of order leaves
the visibility CHECK constraint rejecting the values the code writes.

The env file for that instance is `.env.valerietamplin`, and `.env.local` is a
symlink to whichever instance is currently active — confirm which one it points at
before taking the backup, or you will back up the wrong catalogue.

That instance's row counts differ from the library's, so the verification queries
in each file are the thing to trust rather than the numbers recorded above.

## Running one

Take the backup first. From the batch processor, pointed at the env file for the
instance you are migrating:

    node --env-file=../vivarium/.env.vivarium scripts/sync_from_supabase.mjs

Then paste the migration into the SQL editor as a whole block. Each file wraps
its statements in `begin` / `commit`, so a failure at any point rolls back the
whole thing and leaves the table as it was.

## Order relative to the deploy

Deploy the application code **first**, then migrate — unless a file says
otherwise. The code is written to read the old values correctly during the gap;
the reverse order leaves the database holding values the running code does not
recognise. `2026-09-03-visibility-tiers.sql` is the worked example of why.

One exception so far. `2026-09-04-item-classification.sql` ADDS a column that the
deployed code writes on every save, so between the deploy and the migration those
saves fail outright rather than degrading. Read its header before choosing an
order: running that one first is safe, because an additive nullable column is
invisible to a build that never mentions it.
