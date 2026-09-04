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

| Instance | Supabase account | State |
|---|---|---|
| Library (James's books) | ziopads | 2026-09-03 applied |
| Tamplin catalogue raisonné | separate valerietamplin login | **not applied** |

The Tamplin instance was created from an earlier `schema.sql` and runs the same
codebase, so it needs each migration here applied to its own project. Its
Supabase lives under a different login — check which project you have open
before running anything.

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
