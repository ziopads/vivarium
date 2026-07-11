# Vivarium

A living catalog of a personal library — books, exhibition catalogs, objets d'art, and
musical instruments. Read-only Next.js site backed by Neon Postgres, deployable free on
Vercel. Runs from a local JSON file when no database is configured.

## Stack

- **Next.js 14** (App Router, TypeScript) — RESTful API routes + server-rendered pages
- **Tailwind CSS** — parchment/ink theme
- **Neon** — serverless Postgres (scales to zero; data persists)
- No auth yet — every route is read-only. Add session middleware when you introduce editing.

## Run locally (no database needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL` set, the app reads `data/items.json`
(160 seeded items). Good enough to develop the UI against.

## Connect Neon (when ready)

1. Create a free account at https://neon.com and click **New Project**. Pick a region near
   you; leave the Postgres version default. A database called `neondb` is created for you.
2. In the project, click **Connect**. Choose the **Pooled connection** and copy the
   connection string (starts with `postgresql://…-pooler…`).
3. Create `.env` in this folder (copy from `.env.example`) and paste it:

   ```
   DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require"
   ```

4. Create the table and load the catalog:

   ```bash
   npm run seed
   ```

   This runs `db/schema.sql` then inserts everything from `data/items.json`. Safe to re-run
   (it upserts on `id`).

5. `npm run dev` again — the app now reads from Neon instead of the JSON file.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On https://vercel.com, **Add New → Project**, import the repo. Framework auto-detects as
   Next.js; no build settings to change.
3. In **Settings → Environment Variables**, add `DATABASE_URL` (same Neon string). Redeploy.

Tip: Neon has a native Vercel integration (Vercel Marketplace → Neon) that provisions the
database and injects `DATABASE_URL` automatically if you'd rather skip the manual env var.

## REST API (read-only)

- `GET /api/items` — all items. Filters: `?q=`, `?type=`, `?subject=`, `?place=`
- `GET /api/items/:id` — one item

## Data model

`data/items.json` is the seed. Financial and loan fields (price paid, estimated value,
loaned-to) are deliberately kept **out** of this public dataset and schema — add them to a
separate, auth-gated `holdings` table when you build editing.

## Project layout

```
app/
  page.tsx              list page (server) → renders <Catalog/>
  ui/Catalog.tsx        client: search + facet filters + Cards / Shelf views
  items/[id]/page.tsx   detail page
  api/items/…           REST routes
lib/data.ts             data access — Neon if DATABASE_URL, else data/items.json
db/schema.sql           table + indexes
scripts/seed.mjs        load items.json into Neon
data/items.json         160 seeded items
```
