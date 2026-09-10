# Vivarium

A living catalogue of a personal library — books, exhibition catalogues, objets
d'art, musical instruments, picture frames. Public to browse, private to edit.

The same codebase runs several instances, each against its own database and its
own identity. To stand up a new one, see **`docs/NEW-INSTANCE.md`**.

## Stack

- **Next.js 14** (App Router, TypeScript) — server-rendered pages + API routes
- **Tailwind CSS** — per-instance theme tokens in `app/globals.css`
- **Supabase** — Postgres (catalogue data) + Auth (magic-link login)
- **Cloudflare R2** — image storage (`lib/storage.ts`; see `docs/R2-SETUP.md`)
- Falls back to local JSON files when no database is configured, so the UI can be
  developed with zero setup.

## Architecture principles

- **Config, not a fork.** Every instance runs the same `main`. What differs is an
  entry in `lib/instance.ts`, a `[data-theme]` block in `app/globals.css`, and
  environment variables. Wanting a code branch for one instance is the signal to
  add a config field instead.
- **The app is a dumb reader.** It never calls a language model at runtime.
  Descriptions and other enrichment are generated at ingest and stored; the app
  only reads and displays.
- **Hybrid data model.** Each item is one row: the shared spine (title, type,
  author, year, classification, genres, visibility, images, …) lives in typed
  columns; everything type-specific lives in a JSONB `attributes` bag. Flexible
  without a migration per new field, typed where it counts.
- **Validation at the write boundary.** Every save runs through
  `lib/validation.ts`, which coerces items to the canonical shape so the flexible
  tail cannot drift.
- **Field visibility is fail-closed and server-enforced.** `lib/fieldVisibility.ts`
  strips a record before it is serialized, not in the client. A field is public
  only if it is both eligible and switched on; commercial fields (price,
  provenance, invoice, sale history) can never be switched on at all.

## Run locally (no database needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase environment variables set, the app
reads `data/items.json` and `data/vocab.json` and writes back to those files.

## Run against Supabase

Full procedure in **`docs/NEW-INSTANCE.md`**. In short: create the project, run
`supabase/schema.sql` in its SQL editor, and put the keys in `.env.local` (see
`.env.example`). When the Supabase variables are present the app reads and writes
Postgres instead of the JSON files, with no code change.

Changes to a database that already exists live in `supabase/migrations/` — see
that directory's README for which instance is on which version.

## Filing

A record's `classification` is its full path into the classification tree, stored
as one separator-joined string:

    History & Place/Americas/Maine & New England

That field is authoritative. `section` and `shelf` remain as columns holding the
path's first two segments and are rewritten from it on every save; when a write
supplies both and they disagree, the path wins. A record with no path is unfiled.

Branches declare which item types they serve, and the declaration inherits
downward, so a recordings shelf never appears in a book's picker. An untagged
branch serves everything.

## Auth & access model

Three visibility tiers. The stored values name who reaches a record and are
deliberately not the screen labels:

| stored | reaches | UI label |
|---|---|---|
| `public` | anyone through the site gate | Public |
| `signed_in` | a viewer with a session | Restricted |
| `admin` | admins only | Private |

- **Magic-link login** via Supabase Auth. `AUTH_ALLOWLIST` controls who may sign
  in; `AUTH_ADMINS` controls who may edit.
- **An optional public gate.** One shared password admits a visitor to the
  public, field-stripped view (`PUBLIC_GATE_ENABLED`). Admin rights are separate
  and layered on top.
- Enforcement: middleware guards every write API (non-GET to `/api/items` /
  `/api/vocab`) and the `/admin` and `/manage` pages; edit controls are hidden
  from non-admins in the UI.

## Admin surfaces

- **`/admin`** — hub for the behind-the-scenes tools.
- **`/manage`** — per-item tagging table with bulk classify.
- **`/admin/vocab`** — the classification tree editor: Finder-style columns, one
  tab per item type, with per-branch type tags and item sort order. Renames
  cascade to items.
- **`/admin/duplicates`** — duplicate detection and merge.
- Item detail pages and the browse **List** view offer inline editing (admins
  only).

## Data model

- `items` — one row per item (`supabase/schema.sql`): typed spine columns plus
  the `attributes` JSONB tail.
- `vocab` — a single row holding the classification tree and the public-field
  allowlist.
- `wishlist` — items to find, each tagged with who added it.

Private and financial fields are kept out of anything public-facing. Do not put
personally identifying information in public fields.

## Scripts

- `scripts/migrate-to-supabase.mjs` — full from-scratch reseed of an empty or
  disposable database from the local JSON files. Requires `--full-reseed`; it
  upserts every row and will overwrite newer live edits. **Two known defects —
  see `docs/NEW-INSTANCE.md` before using it.**
- `scripts/ingest.py`, `scripts/merge_results.py`, `scripts/export_pending_csv.py`
  — ingest-side helpers. The photograph-to-record pipeline proper lives in the
  separate `vivarium-batch-processor` repository.

## Project layout

```
app/
  page.tsx                landing + search
  browse/                 the catalogue (Cards / Shelf / List views)
  items/[id]/             item detail (+ inline editors for admins)
  admin/, manage/         vocabulary, tagging, duplicates
  login/, auth/, gate/    magic-link login, callback, shared-password gate
  api/                    items, vocab, wishlist, gate (writes admin-guarded)
  ui/                     client components (Catalog, Gallery, editors, …)
  globals.css             theme tokens, per instance via [data-theme]
lib/
  data.ts                 items read/write — Supabase if configured, else JSON
  vocab.ts                controlled vocabulary — Supabase or JSON
  taxonomy.ts             the classification tree: paths, type scoping, mutation
  itemTypes.ts            per-type field definitions
  instance.ts             per-instance identity, nav, metadata, theme
  fieldVisibility.ts      server-side stripping for the public tier
  visibility.ts           the three tiers and their legacy aliases
  storage.ts              Cloudflare R2
  supabase.ts             service-role client (server only)
  auth.ts, gate.ts        session + allowlist helpers, shared-password gate
  validation.ts           write-boundary normalization
  types.ts                the Item type
middleware.ts             session refresh + write/admin guards
supabase/
  schema.sql              fresh-install schema — always the current shape
  migrations/             dated changes for databases that already exist
data/                     items.json + vocab.json (seed + local fallback)
docs/                     NEW-INSTANCE.md, R2-SETUP.md, HISTORY.md
```
