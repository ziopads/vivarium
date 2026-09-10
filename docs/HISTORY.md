# Vivarium — development history

**A record of July 2026, frozen.** It describes how Vivarium went from a local
prototype to a live, authenticated production application, and it is not
maintained. Specifics in it have since been superseded — section-scoped shelves
by the classification tree, two-tier visibility by three tiers, a single
deployment by several instances.

For how things work now, see `README.md`. For standing up a new instance,
including the email, DNS and hosting steps that started life in this document,
see `docs/NEW-INSTANCE.md`.

Guiding principle throughout, and still true: **the app is a dumb reader.** It
never calls a language model at runtime; enrichment happens at ingest, and the
app reads and displays.

---

## Timeline

### Phase 0 — Local prototype (pre-git)
A Next.js (App Router, TypeScript, Tailwind) reader over `data/items.json`. The
taxonomy, per-item descriptions, and the local image-prep scripts (resize and
convert to webp) were developed here, against flat JSON files, before the
repository existed. The catalogue reached ~980 items entirely file-backed.

### Phase 1 — Preparing to go live · Jul 10 (`411fee8`)
Section backfill, image-reference cleanup, and the first Supabase migration
scaffolding. The realization that shaped everything after: **serverless hosting
has a read-only filesystem**, so a file-backed app cannot persist edits once
deployed. That forced the move to a real data layer.

### Phase 2 — Production stack · Jul 11 (`6015836`)
The big one. Chose Vercel + Supabase (Postgres and Auth) + Cloudflare R2, and
built the data layer on the hybrid model — typed columns for the shared spine, a
JSONB `attributes` bag for the type-specific tail — with `lib/data.ts` reading
and writing Supabase when configured and falling back to local JSON otherwise.
Write-boundary validation (`lib/validation.ts`) landed here, coercing every save
to the canonical shape so the flexible tail could not drift. Auth arrived as
public browse and admin edit: magic-link login, an allowlist, and admin and
viewer roles. The list view became read-only for non-admins.

### Phase 3 — Images on R2 · Jul 11 (`eca37cf`)
An approach that keeps the image **key** in the data and builds URLs at render
time (`lib/img.ts`), so the stored `src` never changes. Moving images to R2 was a
render swap rather than a data migration.

### Phase 4 — Item types · Jul 11 (`8629b3d`)
A per-type field registry (`lib/itemTypes.ts`), a **Frame** type (outer and sight
dimensions, depth, rabbet depth, material), and an in-app new-item flow.
Type-specific fields ride in the JSONB tail, so a new type needs no migration.

### Phase 5 — Privacy and enforcement · Jul 11 (`960e80c`)
`restricted` items made admin-only, hidden from the public and from signed-in
non-admins alike; non-book items defaulted to private on creation. *(Superseded:
the September 3 migration replaced this two-tier arrangement with three, and
renamed the stored value to `admin`.)*

### Phase 6 — Taxonomy · Jul 11 (`f2e6f94`)
**Section-scoped shelves** (`shelvesBySection`) — shelves became children of
their section, so "Maine" under Art and "Maine" under Regions & Cultures were
distinct. A section-scoped vocabulary editor managed shelves within each section.
*(Superseded by the classification tree, which replaced two fixed levels with a
path of any depth.)*

### Phase 7 — Build fix and wishlist gate · Jul 11 (`cb7e0f7`)
Marked the read-only API routes `force-dynamic` (see the cache note below) and
gated the wishlist behind login.

### Phase 8 — Browse and editing consistency · Jul 11 (`7fca5cc`, `2437b19`)
Two-level browse: a section showed its shelves as filter chips, with
section-aware shelf dropdowns everywhere. The inline list view adopted the
`/manage` conventions. Shelves alphabetized; vocabulary columns reordered.

### Phase 9 — Shareability · Jul 11 (`d469b4b`, `e6f14db`)
A bookplate-style Open Graph image via `next/og`, EB Garamond on the theme
palette, so a texted link renders a proper preview.

### Phase 10 — Mobile · Jul 11 (`088d24c`)
Responsive header, padding and toolbar; tighter phone gutters with the sticky
toolbar's bleed fixed to match; a slimmer detail-page label column; image
width-capping so a wide photograph cannot cause horizontal scroll.

### Phase 11 — Wishlist quick-add · Jul 11–12 (`64ccca0`, `c5928fc`, `5f2ff65`)
An on-the-go capture flow: a phone camera input with optional title and author,
the photograph resized and webp-encoded in the browser before upload to R2.
Entries tracked per user and filterable, as a tappable list leading to a detail
page with a large image and admin edit and delete.

---

## Why the stack

Going live forced the persistence decision first: serverless filesystems are
read-only at runtime, so the file-backed model could not persist edits. Supabase
Postgres became the source of truth, with the local-JSON fallback kept for
development. Vercel for hosting. R2 for images, because it is S3-compatible and
charges no egress, which is what beats plain S3 for files served repeatedly.

## Things that happened once

**A caching gotcha, and why `lib/supabase.ts` looks the way it does.** The full
items query is about 2.2 MB, over Next's 2 MB fetch-cache limit, which threw
"Failed to set Next.js data cache" on every read. The fix was to give the
Supabase client a `cache: 'no-store'` fetch and mark the read-only API routes
`force-dynamic`, since a route cannot be statically prerendered when its fetch is
no-store. Pages were already dynamic, so this only ever affected the API routes.
The comment in `lib/supabase.ts` refers to this.

**Vercel and GitHub identity.** The trickiest operations problem of that week.
The Vercel account's email was one identity while its linked GitHub was another,
so every repository import surfaced the wrong account's repositories. The fix was
re-linking the correct GitHub under Vercel → Settings → Authentication, in the
Sign-in Methods section, rather than anything on the import screen.

**Git snags.** Interrupted commits left a stale `.git/index.lock`, cleared with
`rm -f .git/index.lock`. The first push was a non-fast-forward because the new
GitHub repository had its own auto-generated initial commit, resolved with a
force-push over the throwaway.

**Reads fail soft.** The wishlist returns an empty list rather than a 500 if its
table does not exist yet, so a setup gap never white-screens a family member.
