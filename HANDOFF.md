# Vivarium / Valerie Tamplin CR — Handoff

*Rewritten 24 July 2026, superseding the 23 July version. State as of the end of
the second build session.*

---

## What this is

Two related things sharing one codebase:

1. **The catalogue raisonné (CR)** — an administrative, canonical record of every
   work Valerie Tamplin has made. Replaces a fragile shared Google Doc and images
   scattered across folders with inconsistent names. Holds locations, provenance,
   prices — the private interior.
2. **"Selected Works"** — an invitation-only, password-gated, sortable subset of
   the CR, emailed to gallerists and fellow artists who want a deeper look than
   valerietamplin.com offers. No link from the public site.

**Acceptance test:** someone names a work — say the Portland Observatory painting
— and the canonical image and data are in hand in seconds. As of this session
that test passes locally: all 221 works render with images at `/browse`.

---

## Architecture

### The correction that shaped this session

The 23 July plan drifted toward building a **separate `/cr` route tree** with its
own data loader and layout. That was a fork, and the previous handoff had already
ruled it out ("config-driven deployment, not a fork") without either party
noticing.

`lib/data.ts` already had everything needed: Supabase when configured, local JSON
file otherwise, a typed spine plus an `attributes` JSONB tail, and per-item
visibility. So:

- **There are no CR-specific routes.** "CR-ness" is a view over the existing
  routes — a filter (one artist), a sort (chronological), and a theme.
- **`lib/crData.ts` and `lib/crImage.ts` were written and deleted.** Both
  duplicated existing capability.
- Adding `Painting` to `itemTypes.ts` made `/items/[id]` render paintings the
  same afternoon.

**The general rule this produced:** before building a capability for the CR,
check whether vivarium already has it under a different name. It did for data
loading, image resolution, vocabulary, categories, and bulk assignment.

### Deployment vs data

Capability coexists in **one codebase** — a deployment renders whatever
itemTypes its data contains, so an instance can be library and catalogue at once.
Instances stay separate for **governance, not architecture**: Valerie's prices,
collectors, and locations stay out of James's personal database so a future
handoff is a transfer rather than an extraction.

`catalog.valerietamplin.com` will be its own Vercel project with its own Supabase
project and its own R2 bucket, all under `ziopads`.

**Reversibility runs one way.** Merging two instances later is a row copy;
splitting one after her private data has entangled with the library's is
expensive. Hence separation now.

### Identifiers — decided, and the reasoning matters

**Item ids are true surrogates.** Small sequential integers (`000001`–`000221`),
assigned once at first ingest, never derived from anything.

An earlier proposal derived the id from the CR number (`VMT-1972-009` → `1972009`).
It was retracted, because **CR numbers change**: two already needed normalizing
(`VMT-61-002` / `VMT-61-02`), ten works have no title, one had `$` as its title,
four images are misfiled, and the *Monjoy/Munjoy* spelling is still unresolved.
Semantic identifiers attract corrections; surrogate keys don't. A derived id
turns every correction into a folder rename plus a rewrite of every stored image
path.

**`refNumber` is the human-facing catalogue number** — displayed, searchable,
unique-indexed — and is never a path component or a join key. It's the label on
the object, not the address of the object. The name is deliberately neutral, not
`crNumber`, because an accession number for third-party art is the same kind of
object.

**Re-ingest is idempotent without being derived:** existing ids are looked up by
`refNumber` from the previous output, which is the system of record once written.

### Image addressing

```
public/<imageDir>/000042/xVMT-1955-001_web.jpg
       └ id: which record        └ CR#: which work
```

Folders are id-named; filenames keep their CR#-derived names. The trace runs both
directions.

**This is not a dev-only convention.** `lib/img.ts` builds `items/<src>…` and
prefixes it with `NEXT_PUBLIC_R2_PUBLIC_URL` when set — the same key string is a
local path in dev and an R2 object key in production, and it is stored in every
`images[].src` value. Renaming later means copying 2.1 GB of R2 objects *and*
rewriting every row.

Locally the id-named folders are **symlinks** into `cr-working/images/<CR#>/`,
created by the ingest. The symlink is a stand-in for the production **upload
step** — both perform the same CR# → id mapping at publish time.

---

## Instance switching (local development)

Three optional env vars. **Unset, every one of them reproduces the previous
behaviour exactly** — this is the rule for anything added here, since vivarium is
a deployed app.

```
LOCAL_DATA_FILE=data/items.tamplin.json
NEXT_PUBLIC_LOCAL_IMAGE_DIR=items-tamplin
# VOCAB_FILE — optional; derived from LOCAL_DATA_FILE when omitted
```

- **`LOCAL_DATA_FILE` forces local mode**, even when Supabase is configured.
  Naming a dataset is an unambiguous statement about which one you want.
- **`NEXT_PUBLIC_LOCAL_IMAGE_DIR` wins over R2**, for the same reason.
- **Vocabulary follows the data file** — `items.tamplin.json` →
  `vocab.tamplin.json`.

Switching instances is editing `.env.local` and restarting. `npm run dev` never
changes.

### Why these have the semantics they do

Three near-identical bugs were found and fixed this session, all the same shape:
**one instance silently reaching into another's storage.**

1. `readLocalItems` fell back to a compiled-in snapshot of `items.json` on *any*
   read failure — so a typo'd path served James's library while claiming to be
   Valerie's catalogue. Worse, it was a live data-loss bug for the library alone:
   an unparseable `items.json` fell back to the stale bundled copy, and the next
   save persisted that over the real file.
2. `lib/img.ts` ignored the local image dir whenever R2 was configured. Since
   `.env.local` has R2 for the library, every painting was fetched from the
   library's bucket. **Broken images with no log entries anywhere** — the
   requests never reached localhost.
3. `getVocab` checked Supabase independently of the item mode, and its path was
   hardcoded — so one instance's items could pair with another's sections.

An explicitly named local resource now always wins, and read/write mode is
computed once in `dataSource()` and shared by every call site. Reads from one
store and writes to another would upsert one dataset into the other.

---

## The CR data

### Convention

`VMT-YYYY-NNN` — four-digit year, three-digit zero-padded sequence. A lowercase
letter suffix (`a`, `b`) is **an additional view of the same work**, not a
separate work. Range 1955–2025.

### State: clean

221 works, 232 images. Zero format problems, zero duplicate IDs, zero year
mismatches. **`refNumber` is the only safe key from the workbook** — seven titles
are shared by distinct works (five *Self Portrait*s, three *Complementary Colors
Study*, plus *Bather*, *Puzzle*, *Flight*, *Reflection*, *In the Grip*). Never
match or dedupe on title.

### Images: four tiers

| Tier | Long edge | Notes |
|---|---|---|
| `_full` | native | verbatim copy, 1.82 GB |
| `_zoom` | 3000 px | **213 of 232** — absent below a 2000px source |
| `_web` | 1600 px | |
| `_thumb` | 400 px | |

Sources: 168 professional masters (median 4,964 px) in `~/Desktop/VMT CR OF
RECORD`; 64 recovered from the workbook (capped 2,048 px) in `~/Desktop/recovered
2`, carrying an `x` filename prefix. Tree total 2.10 GB, backed up to an external
drive.

**The zoom contract:** `img.zoom` is `null` when the source was under 2000 px,
and the fallback lives in exactly one function — `imageUrl(img, 'zoom')` returns
`zoom ?? web`. No component writes the fallback itself. `hasZoom()` decides
whether to offer zoom UI at all; the Gallery caption shows a **Zoom** link only
when a real tier exists.

### Photography backlog — three tiers, not one

The previous handoff called three works "the entire photography backlog." That
understated it:

1. **3 works with no image at all** — `VMT-1972-009` *Complements*,
   `VMT-1992-002` *Senter's*, `VMT-2002-002` *Munjoy Hill*.
2. **19 images under 2000 px**, so no zoom tier. 17 are recovered-only; two are
   filed as "professional" but are almost certainly the *wrong file* rather than
   a bad shoot, since their own `a`/`b` variants are larger — `VMT-2007-001`
   *Nikko* (1062 px) and `VMT-2002-004` *Monjoy Hill View* (1582 px).
3. **64 recovered images capped at 2048 px**, which no amount of processing
   improves.

Three worth prioritising: **`VMT-1972-019` *At Ease*** (1671 px) is a Hale
anatomy study that exists nowhere else and survived only because the
stranded-anchor bug was caught; ***Monhegan Cliff #1* and *#2*** (1845/1969 px)
are seascapes sitting just under the threshold.

---

## Taxonomy

Both axes already existed in vivarium. Neither needed a new field.

**`itemType` — what the object is.** `Painting`, `Drawing`, `Print`, `Sculpture`,
`Collage & Assemblage`. Medium is irrelevant to the type: oil, acrylic, and
watercolour are all `Painting`, and `medium` keeps the fine grain. The five share
one `ARTWORK_FIELDS` definition — they differ in what the object is, not in what
is recorded about it.

Current distribution: **171 Painting, 43 Drawing, 4 Collage & Assemblage, 2
Print, 1 Sculpture.**

**`section` — what the work depicts.** `Abstract`, `Figurative`, `Landscape`,
`Still Life`. Seascapes fold into Landscape, by decision. Seeded into
`data/vocab.tamplin.json` on first ingest; `/admin/vocab` owns it thereafter.

**Sections cannot be derived from any column in the workbook.** All 221 need
human judgment, assigned from `/manage` — which now shows a thumbnail in the
sticky Title column, so the work is visible while categorising. This is the main
outstanding task.

### The `etch` bug — worth not repeating

The first classification run produced **69 Prints out of 221**, which is
implausible for a painter. Cause: the Print rule contained bare `etch`, matching
`stretched` in "acrylic on stretched canvas". Print is tested before Painting, so
67 paintings were misfiled. Same class: bare `cont[eé]` matches "contemporary".

Word boundaries in `MEDIUM_RULES` are load-bearing: `\betch`, `\bcont[eé]\b`,
`\bwood\b` (so it doesn't eat "woodcut"), `\bcast\b`.

**The tell was an implausible distribution**, and it was only checkable because
the catalogue was rendering — 69 prints looked wrong against what's known of her
work. Get things on screen before trusting derived data.

---

## Questions for Valerie — one conversation, not four

These lists overlap:

- **10 untitled works:** `VMT-1990-004/010/015/016`, `VMT-1991-007`,
  `VMT-2001-001`, `VMT-2006-015` (had a stray `$`), `VMT-2006-016`,
  `VMT-2023-013`, `VMT-2024-011`.
- **9 works with no medium recorded** — the workbook holds the literal
  placeholder `[insert all material attributes]`: `VMT-1964-005`,
  `VMT-1972-017`, `VMT-1988-003`, `VMT-1988-004`, `VMT-1990-010`,
  `VMT-1991-001`, `VMT-2021-004`, `VMT-2023-012`, `VMT-2024-020`.
- ***Monjoy* / *Munjoy* Hill** — one of the two is a typo.
- **Re-photography priorities** (above).

**Works appearing on more than one list:** `VMT-2006-016` (untitled, 700 px
image, recovered-only — the thinnest record in the catalogue), `VMT-1990-010`
(untitled *and* no medium), `VMT-1988-004` *Easter* (no medium, 1366 px),
`VMT-1990-016` (untitled, 1421 px).

Six misspellings also live in the medium column — *guache*, *enamal*, *colage*,
*scrylic*. `MEDIUM_RULES` matches them **deliberately**, so the catalogue remains
the record of what was written rather than silently corrected.

---

## What exists now

```
vivarium/
  lib/
    data.ts          dataSource(), LOCAL_DATA_FILE, tightened fallback
    img.ts           imgUrl (legacy) + imageUrl(img, tier) + coverImage()
    rescan.ts        scanFolder() + mergeGallery() — NOT yet wired to a route
    vocab.ts         follows dataSource(), path derived from data file
    itemTypes.ts     ARTWORK_TYPES + shared ARTWORK_FIELDS
    types.ts         images[] gained optional `files` + `base`
    validation.ts    carries `files`/`base` through the write boundary
  scripts/
    build-cr-images.mjs    four-tier pipeline
    add-zoom-paths.mjs     idempotent works.json patcher
    ingest-tamplin.mjs     works.json → data/items.tamplin.json + symlinks
  data/
    items.tamplin.json     221 items — SYSTEM OF RECORD for ids
    vocab.tamplin.json     four sections
  public/items-tamplin/    221 symlinks → cr-working/images/<CR#>/
  cr-working/              gitignored; 2.10 GB
```

`.gitignore` covers `/cr-working/`, `/data/tamplin/`, `data/items.tamplin.json`,
`*.xlsx`, `~$*`, `/reports/`, `public/items/`, `public/items-tamplin/`.

### Ownership split — do not violate

The ingest rebuilds items from the workbook on every run. It **preserves
app-owned fields**, without which any categorisation done in `/manage` would be
destroyed by the next ingest.

| Workbook owns | App owns |
|---|---|
| title, year, medium, dimensions | **section**, visibility, genres, subjects |
| provenance, price, realizedPrice | places, shelf, description, discussion |
| invoice, saleHistory, exhibitions | owner, signed, maine, **chosen cover** |
| bibliography, framing, status, index | |

`itemType` is derived for **new works only**, so a manual correction sticks. Pass
`--reclassify` to re-derive everything after improving the rules.

### Running it

```
node scripts/build-cr-images.mjs          # incremental; NOT --force
node scripts/add-zoom-paths.mjs
node scripts/ingest-tamplin.mjs           # add --reclassify after rule changes
```

**Do not use `--force`** on the image build. `isStale()` already returns true for
any file that doesn't exist, so a plain run builds only what's missing; `--force`
re-copies 1.82 GB of verbatim `_full` files for nothing.

---

## Hard-won lessons

- **The workbook still contains its images.** All three `.xlsx` files on the
  Desktop are ~138 MB and within 113 bytes of each other — the two named "NOPIX"
  were never actually stripped. The strip is now safe (every image is extracted
  and keyed by CR#), but it hasn't happened.
- **Never round-trip the workbook expecting images to survive** — most
  spreadsheet libraries drop anchored objects on save. That hazard now *inverts*:
  a library dropping media is doing the wanted job.
- **Moving rows in Excel desynchronizes anchored images.** It happened: three
  anatomy studies stacked on row 73 (*Cherrycroft*), and *At Ease* existed
  nowhere else.
- **Naive zero-padding merges records.** Two collisions were caught before damage.
  Always collision-check before normalizing an ID.
- **Extension case matters.** `.JPG` vs `.jpg` is invisible on macOS, fatal on
  R2/Linux.
- **`validateItem` rebuilds image entries rather than spreading them.** Its
  comment claims extra fields pass through; that's true at the item level only. A
  `files` block would have survived the ingest and evaporated on the first
  in-app save — images working fine until someone edited a record.

---

## Open decisions

| # | Decision | Notes |
|---|---|---|
| 1 | **R2 bucket namespacing** | With surrogate ids, a Tamplin painting and a book both want `items/000042/`. Separate Supabase projects don't help — this is the storage layer. Point each instance's `NEXT_PUBLIC_R2_PUBLIC_URL` at its own bucket. **Settle before the first upload.** |
| 2 | **Field-level visibility** | Vivarium has item-level visibility; the CR needs title public and price private *on the same record*. Build as a general capability — books have purchase prices too. Until it exists, any instance holding real prices stays behind the shared password. |
| 3 | **Do underpaintings get numbers?** | Row 136 *Fall Fire underpainting* has no CR# and no year; excluded from `works.json`; image unprocessed as `UNASSIGNED-row136.jpg`. |
| 4 | **Four misfiled "professional" images** | `VMT-2007-001`, `VMT-2002-004` (both smaller than their own variants), `VMT-2004-001`, `VMT-2006-015` (2048×1536, likely phone photos). |
| 5 | **Workbook columns** | Adding Type/Category columns to the `.xlsx` was started and abandoned once both axes turned out to exist in vivarium already. Probably unnecessary now. |

---

## Next steps

1. **Assign sections to 221 works** from `/manage`. The main task. Batchable with
   the type filter; thumbnails are in the sticky column.
2. **Wire the rescan endpoint.** `lib/rescan.ts` exists but nothing calls it.
   `POST /api/items/rescan { ids?, prune?, dryRun? }`, matching the existing
   `bulk-section` house style, triggered from `/manage` on a selection.
   **Semantics matter:** additive by default, preserves order and chosen cover,
   and *refuses* when a folder is missing or empty-while-the-record-has-images —
   `public/items-tamplin` is a symlink into gitignored `cr-working/`, and on a
   fresh clone a naive rescan would blank all 221 galleries without tripping the
   10-row delete guard.
3. **Theming**, which needs the route-group split: `app/layout.tsx` is a root
   layout wrapping *every* route in the Vivarium wordmark, nav, `max-w-6xl`, and
   footer. Reduce it to a bare shell, move the chrome into
   `app/(librarian)/layout.tsx`, move the six route folders in (route groups
   don't change URLs; `app/api` and `app/auth` don't move). Then the CR instance
   gets Instrument Sans and its own tokens.
4. **Shared-password middleware + `noindex`**, before anything reaches a
   gallerist. Note `middleware.ts` currently calls `supabase.auth.getUser()` on
   every non-static path.
5. **R2 upload + backup export.** The upload replaces the symlink step, applying
   the same CR# → id mapping to object keys.
6. **Repo transfer:** `valerietamplin-website` still lives under `6gorish` and
   needs moving to `ziopads`, then a careful domain cutover.

### valerietamplin.com design tokens (the CR should read as a sibling)

Instrument Sans throughout, no serif. Ink `#1A1A1A` on white; grays `#666`/`#777`/
`#999`; hairline borders `#E5E5E5`. Tiny wide-tracked uppercase labels (11–14px,
0.04–0.08em). Body 16px/1.7. Work titles italic. 60px gutters, 120px section
rhythm; max widths text 640 / image 1400 / page 1600. Four-column square thumbnail
grid, subtle hover. Detail view: image ~70–75vh with a right-aligned 200px caption
column. Restrained fade-up, `prefers-reduced-motion` respected.

Note the current Gallery caps images at `max-h-[30rem]` — far too small for
paintings, and part of the theming pass.

---

## Other threads

- **Curation & selection** — which works go into the gated view. Prior stance
  (Feb 2026): lead with figurative + abstract-ink work; landscape/still life as
  secondary "range and foundation." Revisit once sections are assigned.
- **Gallery strategy** — Elizabeth Moss Galleries; Phoebe Porteous introduction.
- **⚠ valerietamplin.com contact form.** Still the highest-consequence open item
  and **unchanged since February**. The Resend rewrite was never committed and
  the package never installed; production still serves the stub that silently
  drops submissions. That is how Phoebe's message was lost. Ten minutes, and it
  should happen before any gallerist gets a link to anything.
