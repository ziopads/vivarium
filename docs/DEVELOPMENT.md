# Vivarium — Development History

A record of how Vivarium went from a local prototype to a live, authenticated,
production app — with emphasis on the **operations story** that a git log doesn't
capture (the hosting, DNS, auth, and storage decisions, and the gotchas along the way).

Vivarium is a personal library catalogue — books, art, instruments, and objects
(e.g. picture frames) — with a warm reader UI and admin editing. Guiding principle
throughout: **the app is a "dumb reader."** It never calls an LLM at runtime;
enrichment happens at ingest, and the app just reads and displays.

---

## Timeline

### Phase 0 — Local prototype (pre-git)
A Next.js (App Router, TypeScript, Tailwind) reader over `data/items.json`. The
taxonomy, per-item descriptions, and the local image-prep scripts (resize/convert
to webp) were developed here, against flat JSON files, before the repo existed.
The catalogue reached ~980 items entirely file-backed.

### Phase 1 — Preparing to go live · Jul 10 (`411fee8`)
Section backfill, image-reference cleanup, and the first Supabase migration
scaffolding. The realization that shaped everything after: **serverless hosting has
a read-only filesystem**, so a file-backed app can't persist edits once deployed.
That forced the move to a real data layer.

### Phase 2 — Production stack · Jul 11 (`6015836`)
The big one. Chose the stack — **Vercel + Supabase (Postgres/Auth) + Cloudflare R2** —
and built:
- **Data layer** on Supabase with a **hybrid model**: typed columns for the shared
  spine, a JSONB `attributes` bag for the type-specific tail. `lib/data.ts` reads/writes
  Supabase when configured, else falls back to the local JSON (so dev still works with
  zero setup).
- **Write-boundary validation** (`lib/validation.ts`) — coerces every save to the
  canonical shape so the flexible tail can't drift.
- **Auth**: public browse, admin edit. Magic-link login, allowlist + admin/viewer roles.
- List view made read-only for non-admins; R2 setup + README docs.

### Phase 3 — Images on R2 · Jul 11 (`eca37cf`)
A `lib/storage`/render approach that keeps the image **key** in the data and builds
URLs at render time (`lib/img.ts`), so the stored `src` never changes — moving images
to R2 was a render swap, not a data migration. A script uploads `public/items/**` to R2.

### Phase 4 — Item types · Jul 11 (`8629b3d`)
A per-type field registry (`lib/itemTypes.ts`) + a **Frame** type (outer/sight
dimensions, depth, rabbet depth, material) + an in-app "new item" flow. Type-specific
fields ride in the JSONB tail, so new types need no migration.

### Phase 5 — Privacy & enforcement · Jul 11 (`960e80c`)
`restricted` items made **admin-only** (hidden from the public *and* signed-in
non-admins); non-book items default to private on creation.

### Phase 6 — Taxonomy · Jul 11 (`f2e6f94`)
**Section-scoped shelves** (`shelvesBySection`) — shelves became children of their
section, so "Maine" under Art and "Maine" under Regions/Cultures are distinct, and a
shelf like "Martial Arts" lives only under its section. A section-scoped vocabulary
editor manages shelves within each section; renames/deletes cascade appropriately.

### Phase 7 — Build fix + wishlist gate · Jul 11 (`cb7e0f7`)
Marked the read-only API routes `force-dynamic` (see the "no-store cache" note below)
and gated the wishlist behind login.

### Phase 8 — Browse & editing consistency · Jul 11 (`7fca5cc`, `2437b19`)
**Two-level browse**: a section shows its shelves as filter chips. Section-aware shelf
dropdowns everywhere. The inline list view adopted the `/manage` conventions (controlled
section/shelf/condition dropdowns). Shelves alphabetized; vocab columns reordered to
Sections · Shelves · Genres.

### Phase 9 — Shareability · Jul 11 (`d469b4b`, `e6f14db`)
A bookplate-style **Open Graph image** (via `next/og`, EB Garamond serif on the theme
palette) so a texted link renders a proper preview; catalogue cards show `section: shelf`.

### Phase 10 — Mobile · Jul 11 (`088d24c`)
Responsive header/padding/toolbar, tighter phone gutters (with the sticky toolbar's bleed
fixed to match), a slimmer detail-page label column, and image width-capping so a wide
photo can't cause horizontal scroll.

### Phase 11 — Wishlist quick-add · Jul 11–12 (`64ccca0`, `c5928fc`, `5f2ff65`)
An on-the-go capture flow: a **phone camera input** + optional title/author, with the
photo **resized/webp-encoded in the browser** before uploading to R2. Entries are tracked
**per user** and filterable (Who / Section dropdowns). The list became a tappable list
→ **detail page** with a large image (tap for full-res) and admin edit/delete.

---

## DevOps chronicle (the part git doesn't narrate)

**Why the stack.** Going live forced the persistence decision first: serverless
filesystems are read-only at runtime, so the file-backed model couldn't persist edits.
Supabase Postgres became the source of truth (with a local-JSON fallback kept for dev).
Vercel for hosting (200-project Hobby limit; fine), R2 for images (S3-compatible, **zero
egress** — the reason it beats plain S3 for files served repeatedly).

**Data migration.** `scripts/migrate-to-supabase.mjs` seeds Postgres from the JSON files;
it's idempotent, so re-running after any local change just refreshes the rows. The vocab
is a single JSONB row; items are one JSONB-per-row-plus-typed-columns.

**A caching gotcha.** The full items query is ~2.2 MB, over Next's 2 MB fetch-cache limit,
which threw "Failed to set Next.js data cache" on every read. Fix: give the Supabase
client a `cache: 'no-store'` fetch, and mark the read-only API routes `force-dynamic`
(they can't be statically prerendered when the fetch is no-store). Pages were already
dynamic, so this only ever affected the API routes.

**R2 setup.** Create a bucket, enable the public `r2.dev` URL, and make an **Object Read &
Write** API token (Cloudflare tucks this under *Storage & databases → R2 → API Tokens →
Manage* — easy to miss, and *not* the generic My-Profile API tokens). Env split matters:
the browser only needs `NEXT_PUBLIC_R2_PUBLIC_URL` (read); the upload route needs the
server keys (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) —
those must be set in the host, not just the public URL.

**Auth + email.** Supabase Auth for magic links. To avoid the throttle on Supabase's
built-in mailer, custom SMTP via **Resend**. Because the root domain already forwards mail
through ImprovMX (its own MX records), the Resend sending domain was set up as a
**subdomain** (`send.gaffcutter.com`) so it never touches the root MX. Two traps here:
the SMTP **username is literally `resend`** (not the app/email name) and the **password is
the Resend API key** — and a browser password manager will happily autofill those fields
with garbage, so type them by hand. Separately: magic-link login only works once the
**production URL is in Supabase's Auth → URL Configuration** (Site URL + Redirect URLs);
otherwise links bounce to `localhost`.

**Deployment tangles.** The trickiest ops of the day was Vercel + GitHub identity. The
Vercel account's *email* was one identity while its *linked GitHub* was another, so every
repo import kept surfacing the wrong account's repos — the fix was re-linking the correct
GitHub under Vercel → Settings → Authentication (the "Sign-in Methods" section), not the
import screen. The custom domain is a Namecheap **CNAME → `cname.vercel-dns.com`**, set to
**DNS-only** (grey cloud if the DNS were on Cloudflare) — and Namecheap's Host field takes
only the *subdomain part*, not the full name.

**Git snags.** Two recurred: interrupted commits left a stale `.git/index.lock`
(`rm -f .git/index.lock` clears it), and the very first push was a non-fast-forward
because the new GitHub repo had its own auto-generated initial commit (resolved with a
force-push over the throwaway). `.gitignore` keeps image binaries (`public/items/`) and
`*.bak*` backups out of the repo.

**Supabase specifics.** The free tier caps at **2 active projects per account**, which is
why infrastructure is organized by identity. RLS is enabled on all tables with no anon
policies (deny-by-default); the app reads/writes server-side with the service-role key,
which bypasses RLS. Reads are written to fail soft — e.g. the wishlist returns an empty
list rather than 500-ing if its table doesn't exist yet — so a setup gap never
white-screens a family member.

**Backups** are the known next operational task: a scheduled dump of the `items`/`vocab`/
`wishlist` tables (and an image sync) now that it's live data with people editing.

---

## Architecture principles (the durable decisions)

- **Dumb reader.** No LLM at runtime; enrichment happens at ingest.
- **Hybrid data model.** Typed columns for the shared spine, JSONB for the type-specific
  tail — flexible without a migration per field or per new item type.
- **Validation at the write boundary** keeps the flexible tail from drifting.
- **Controlled vocabulary**, with shelves scoped to their section.
- **Public browse / admin edit**; `restricted` items are admin-only.
- **Keys, not paths, for storage** — the app stores the R2 key and builds the URL at
  render, so the storage host can change without touching data.
- **Client-side image resize** for on-the-go uploads (small, fast, no server image lib).
- **Attributed writes** for any machine-generated content — kept separate from curated
  fields (the basis for the planned research/annotation layer).

---

## Current stack

Next.js 14 (App Router, TS) · Tailwind · Supabase (Postgres + Auth) · Cloudflare R2 ·
Vercel · Resend (SMTP) — deployed at `vivarium.gaffcutter.com`.

## What's next

- Per-item write-ups (paced) and non-book card polish.
- Scheduled backups of the live data.
- A **research/annotation layer**: a hosted MCP server that lets an LLM read the
  catalogue's structured data and photos and write *attributed* annotations back — turning
  the app from a reader into something you can analyze and enrich conversationally.
