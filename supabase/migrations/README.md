# Migrations

`supabase/schema.sql` is the fresh-install schema and always describes the
current shape. A brand-new instance runs that file and needs nothing in here —
see `docs/NEW-INSTANCE.md` for the whole procedure.

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
| Tamplin catalogue raisonné (valerietamplin.com) | Gaff Cutter's Org — project `vivarium: valerietamplin` | applied 2026-09-10 | applied 2026-09-10 |

The Tamplin project was set up under a separate valerietamplin login and has
since moved; as of 10 September 2026 it sits in Gaff Cutter's Org. Confirm which
project the dashboard has open before running anything, since the name and the
organization are not the same thing.

Each instance has its own local clone of this repository, named for it —
`vivarium`, `vivarium-tamplin` — with `.env.local` as a real file in each. The
old arrangement, one checkout with `.env.local` symlinked to whichever instance
was active, is gone: instance identity is directory state now, and a script run
in the wrong tree cannot reach another instance's database because those
credentials are not in that tree.

### What the Tamplin migration actually did — worth knowing before the next one

Both files were nearly no-ops on that data, and both were still necessary.

All 221 records were `public`, so the visibility file's two `update` statements
affected zero rows. What it installed was the CHECK constraint: the one in place
predated the rename, so the first time anyone set a record to Restricted or
Private the write would have been rejected.

No record carried a `section`, so the classification backfill had nothing to
compute from and left the column null on all 221 — which is what unfiled means.
**Its after-query correctly reports zero filed, which looks exactly like a failed
migration.** Check what the data holds before running it, so you know which
result you are expecting.

The real verification was neither query. Every Vercel project deploys from
`main`, so that instance had been running current code since 4 September, writing
a `classification` column that did not exist — Postgres rejecting every save for
six days. Editing one record and watching it stick is what proved the repair.

## Before you run one

**Take a backup.** Two routes, and which you have depends on the env file.

`pg_dump` is the better artefact — it captures schema as well as rows, so it can
undo a migration that leaves the table in the wrong shape:

    cd <the instance's clone>
    set -a; source .env.local; set +a
    pg_dump "$SUPABASE_DB_URL" -Fc -f data/pre-migration-$(date +%Y%m%d).dump

Note `SUPABASE_DB_URL` was **empty in `.env.valerietamplin`** and had been since
July — nothing noticed, because the app never reads it and only scripts do. An
empty string makes `pg_dump` fall through to its defaults and hunt for a local
Postgres socket, which reads as a connection failure rather than a missing
variable. Check the variable has a value before trusting the error.

Note also that the pooled string on port 6543 is not what `pg_dump` wants;
transaction pooling does not support the statements it issues. Use the direct or
session-mode connection.

When there is no connection string, `scripts/backup-tables.mjs` pulls `items`,
`vocab` and `wishlist` through the Data API using the service-role key:

    node --env-file=.env.local scripts/backup-tables.mjs

It writes raw rows — no mapping, no normalization — into the clone's `data/`,
which `.gitignore` already denies. That distinction matters here: 
`sync_from_supabase.mjs` maps every row through `rowToItem`, which normalizes
`visibility`, and that is the column the 2026-09-03 file rewrites. It also prints
the current visibility counts and how many records carry a classification, which
is what tells you what each migration will actually do.

Rows are not schema. Restoring puts old values into whatever shape the table is
in, which helps only if you also undo the DDL by hand.

**Do not use `sync_from_supabase.mjs` as the backup.** Beyond the mapping, its
destination is resolved by `scripts/paths.mjs` against a sibling directory
literally named `vivarium` unless `VIVARIUM_APP` is set — so pointing it at
another instance's env file changes which database it reads and not where it
writes. It aimed 221 Tamplin paintings at the library tree on 10 September; the
id-ahead guard caught it.

## Running one

Confirm which project the dashboard has open before running anything — the
instances live under different logins.

Run each file's before-query first, so you know what you are changing. Then paste
the migration into the SQL editor as a whole block. Each file wraps its
statements in `begin` / `commit`, so a failure at any point rolls back the whole
thing and leaves the table as it was. Then run the after-query.

Order matters where more than one is outstanding: the visibility rename first,
then the classification column. Reversed, the old CHECK constraint rejects the
values the code writes.

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

**Every Vercel project deploys from `main`**, so a push redeploys all of them and
the deploy-first requirement is usually satisfied by accident. The corollary is
the trap: an instance that is behind on migrations is already running the code
that needs them. Do not let a gap sit.
