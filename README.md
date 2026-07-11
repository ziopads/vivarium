# Vivarium

A living catalog of a personal library — books, exhibition catalogues, objets d'art, and
musical instruments (and, soon, other object types like picture frames). Public to browse,
private to edit.

## Stack

- **Next.js 14** (App Router, TypeScript) — server-rendered pages + API routes
- **Tailwind CSS** — parchment/ink theme
- **Supabase** — Postgres (catalog data) + Auth (magic-link login)
- **Cloudflare R2** — image storage *(in progress — see `R2-SETUP.md`)*
- Falls back to local JSON files when no database is configured, so the UI can be developed
  with zero setup.

## Architecture principles

- **The app is a dumb reader.** It never calls an LLM at runtime. Descriptions and other
  enrichment are generated *at ingest* and stored; the app only reads and displays.
- **Hybrid data model.** Each item is one row: the shared spine (title, type, author, year,
  section, shelf, genres, visibility, images, …) lives in typed columns; everything
  type-specific lives in a JSONB `attributes` bag. Flexible without a migration per new
  field, typed where it counts.
- **Validation at the write boundary.** Every save runs through `lib/validation.ts`, which
  coerces items to the canonical shape (types, trimmed strings, clamped `visibility`) so the
  flexible tail can't drift.

## Run locally (no database needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase env vars set, the app reads `data/items.json`
and `data/vocab.json` and writes back to those files — good for developing the UI.

## Run against Supabase

See **`DEPLOY.md`** for the full runbook. In short: create a Supabase project, run
`supabase/schema.sql` in its SQL editor, put the keys in `.env.local` (see `.env.example`),
then seed:

```bash
node --env-file=.env.local scripts/migrate-to-supabase.mjs
```

When the Supabase env vars are present, the app reads and writes Postgres instead of the
JSON files — automatically, no code change.

## Auth & access model

- **Public browse, admin edit.** Anyone can view the catalogue; `restricted` items are
  hidden from anonymous visitors.
- **Magic-link login** via Supabase Auth. `AUTH_ALLOWLIST` controls who may sign in;
  `AUTH_ADMINS` controls who may edit.
- Enforcement: middleware guards every write API (non-GET to `/api/items` / `/api/vocab`)
  and the `/admin` + `/manage` pages; edit controls are hidden from non-admins in the UI.

## Admin surfaces

- **`/admin`** — hub for the behind-the-scenes tools.
- **`/manage`** — per-item tagging table with bulk section-assign.
- **`/admin/vocab`** — edit the section / genre / shelf controlled vocabularies (renames
  cascade to items; deletes clear the value).
- Item detail pages and the browse **List** view offer inline editing (admins only).

## Data model

- `items` — one row per item (`schema.sql`): typed spine columns + `attributes` JSONB.
- `vocab` — a single row holding the section / genre / shelf lists.
- Private/financial fields (valuations, provenance, personal notes) are kept out of anything
  public-facing; do not put personally identifying information in public fields.

## Scripts

- `scripts/migrate-to-supabase.mjs` — seed Supabase from the local JSON files (idempotent).
- `scripts/prep_images.py` / `scripts/apply_images.py` — resize/convert source images to
  webp and associate them with items. (Image storage is moving to R2 — see `R2-SETUP.md`.)

## Project layout

```
app/
  page.tsx                sections landing + search
  browse/page.tsx         the catalogue (Cards / Shelf / List views)
  items/[id]/page.tsx     item detail (+ inline editors for admins)
  admin/, manage/         admin tools (tagging, vocabulary)
  login/, auth/           magic-link login + callback + signout
  api/items/…, api/vocab  read + write routes (writes are admin-guarded)
  ui/                     client components (Catalog, Gallery, editors, …)
lib/
  data.ts                 items read/write — Supabase if configured, else JSON
  vocab.ts                controlled vocabulary — Supabase or JSON
  supabase.ts             service-role client (data)
  auth.ts                 session client + allowlist/admin helpers
  validation.ts           write-boundary normalization
  sections.ts, types.ts   taxonomy helpers + the Item type
middleware.ts             session refresh + write/admin guards
supabase/schema.sql       Postgres schema (run once)
data/                     items.json + vocab.json (seed + local fallback)
DEPLOY.md, R2-SETUP.md    runbooks
```
