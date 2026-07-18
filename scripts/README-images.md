# Adding images — the manual pipeline

Two small scripts turn a pile of photos into catalog-ready images. It runs in two
stages on purpose, so you can **review before anything touches the app data**:

```
photos  ─prep_images.py→  image-ready/  (you review)  ─apply_images.py→  the app
```

Stage 1 (`prep`) only writes webp files into a scratch folder — completely safe.
Stage 2 (`apply`) copies them into the app and, only when creating new items,
writes `items.json`.

---

## The one-command way (recommended)

`ingest.py` runs the whole batch as one resumable, safety-enforced command. It
orchestrates the stage scripts below, so you normally never call them by hand.

```bash
# 1. Lay out the batch: <batch>/<one folder per book>/{1,2,3}.jpg
python3 scripts/ingest.py "vivarium-content/2026 0712"
#    → syncs live (records the true max id), preps, creates skeletons above that id,
#      writes _ingest/pending.csv, then PAUSES.

# 2. Fill _ingest/pending.csv in a Cowork conversation (capture ISBN, look it up,
#    fill fields, set status=ready). Then:
python3 scripts/ingest.py --resume
#    → merges the reviewed rows into local items.json, then PAUSES with a summary.

# 3. When the summary looks right, publish to live (images→R2, insert-only seed):
python3 scripts/ingest.py --resume --approve
```

Safety is enforced, not remembered: it always syncs live first so new ids sit above
the true max, the seed is always insert-only (aborts on any collision), and nothing
touches live until `--approve`. State lives in `_ingest/ingest_state.json`, so an
interrupted run picks up where it left off (`--status` shows progress). This one path
supersedes the older `records_master`/`ingest_batch` flow.

**You only manage your own batch folder** — `<batch>/<one folder per book>/{1,2,3}.jpg`,
placed wherever you like (e.g. under `vivarium-content/`). The driver only *reads* it,
never modifies it. It owns the scratch dirs (`image-intake/`, `image-ready/`, the
`_ingest/` working files) and **clears them automatically at the start of each batch and
again on successful completion**, so there is no manual cleanup and no way to inherit a
previous batch's folders as duplicate records. The real images under `public/items/<id6>/`
are kept (they're what gets uploaded to R2).

The rest of this doc explains the individual stages `ingest.py` runs.

---

## One-time setup
```bash
pip3 install Pillow          # image resizing/conversion
pip3 install pillow-heif     # ONLY if you're dropping in iPhone .HEIC files
```
Python 3.9 (the system one) is fine. All commands below are run from inside the
`vivarium` folder.

---

## Step 0 — lay out the photos
Create one **subfolder per item** inside `vivarium-content/image-intake/`. The
folder's *name* tells the pipeline what to do:

| Folder name | Meaning |
|---|---|
| a **number**, e.g. `210` or `000210` | attach these images to **existing item #210** |
| **anything else**, e.g. `new-vermeer` | **create a new item** from this folder |

Put the raw photos (JPG/HEIC/PNG/TIFF) straight in the folder. For a **new item**,
optionally add a `title.txt`:

```
Title of the Book
Author Name
```
(line 1 = title, line 2 = author; both optional — without it the title is guessed
from the folder name).

**Naming tip:** if a photo's filename contains the word `cover` or `copyright`,
that word carries through to the image's label in the app (and a file with
`cover` in the name becomes the item's default main image on new items).

**Positional convention (recommended for new batches — no `title.txt` needed).**
Name the photos by position and the pipeline labels them for you:

| File | Label | Holds |
|---|---|---|
| `1.jpg` | Front Cover | title (and becomes the cover image) |
| `2.jpg` | Copyright | publisher · year · ISBN (title-page verso) |
| `3.jpg` | Rear Cover | optional — rear-cover ISBN barcode |

With this convention the new item is created with a **blank title**, which marks it
as needing analysis (see the analysis loop below). Each item still gets its own
folder; only the photo names matter.

Example:
```
vivarium-content/image-intake/
├── 214/                     ← add a supplemental shot to existing item #214
│   └── back-cover.jpg
├── 512/                     ← give an image-less item its first images
│   ├── front-cover.jpg
│   └── copyright.jpg
└── new-island-garden/       ← make a brand-new item
    ├── cover.jpg
    ├── title-page.jpg
    └── title.txt
```

---

## Step 1 — prep (safe, no app changes)
```bash
python3 scripts/prep_images.py
```
Auto-orients, resizes, and converts every photo to webp (a full-size image + a
thumbnail), giving each a unique `01-…`, `02-…` name, and writes them to
`vivarium-content/image-ready/<same-folder-name>/`.

Open `image-ready/` and check the results before continuing. Re-running prep
regenerates cleanly, so you can tweak the intake and run it again.

---

## Step 2 — apply (ingests into the app)
> **First:** if you're creating new items, pause the write-up task (toggle it off),
> since this step writes `items.json`. Attaching to items that already have images
> is a pure file-copy and never touches `items.json`.

```bash
python3 scripts/apply_images.py
```
What it does per folder:
- **Existing item with images** → appends the new webps (numbered to continue after
  what's there). No data written.
- **Existing item that had no images** → copies them in and sets its cover pointer.
- **New-item folder** → assigns the next id, copies the images in, and creates the
  record (title/author from `title.txt`, else the folder name; empty description so
  the write-up task fills it later). A backup is written to `items.json.imgbak`.

Then **reload the app**.

---

## Step 3 — set cover & copyright (in the app, manual)
On the item's detail page:
- Click a thumbnail, then **Set as main image** to choose the cover.
- Click a thumbnail, then **Set as copyright page** to mark the copyright page
  (click again to clear). The chosen one shows a **©** badge.

Cover can be picked for you if a source file was named with `cover`; the copyright
page is always set here by hand.

---

---

## Analysis loop — filling the bibliographic data (new items)

New items created by the positional convention come in blank (title/ISBN/etc.). Fill
them with a CSV that Claude works through in a Cowork conversation:

```
apply_images.py ─writes→ _ingest/pending.json
export_pending_csv.py ─→ _ingest/pending.csv   (id, image paths, empty fields)
   → Claude reads each item's photos, captures the ISBN, looks it up
     (Open Library → Google Books), fills the row, sets status=ready
merge_results.py ─────→ folds the filled rows back into data/items.json
```

- `python3 scripts/export_pending_csv.py` — lists only items still needing analysis
  (empty description), so re-running after a merge shrinks the list.
- `python3 scripts/merge_results.py` — applies only rows marked `status=ready`.
  It **fills, never clobbers** (a blank cell can't erase an existing value), validates
  `section`/`shelf`/`genres` against `vocab.json` (unknown values are reported and
  skipped, not written), and backs up to `items.json.mrgbak`.

## Seeding live — safely (read this)

The live data is the source of truth. **Never** run `migrate-to-supabase.mjs` for an
incremental add — it upserts every row and will overwrite live edits with your local
copy (it now refuses to run without `--full-reseed`). Instead:

```
1. node --env-file=.env.local scripts/sync_from_supabase.mjs   # pull live → local FIRST
   (so new ids are assigned above the true live max — no collisions)
2. lay out intake → prep_images.py → apply_images.py           # create skeletons
3. export_pending_csv.py → analyze in Cowork → merge_results.py # fill locally
4. node --env-file=.env.local scripts/seed-new-items.mjs --min <liveMax+1>
   # INSERT-ONLY: aborts if any target id already exists. Existing rows & vocab untouched.
```

Step 1 is what prevents the id-collision that overwrites live records. Do it every time.

## Cleanup & notes
- After a successful apply you can empty `image-intake/` and `image-ready/`.
- New-item defaults (location `Maine`, owner `James`) are constants at the top of
  `apply_images.py` — edit them if a batch belongs elsewhere.
- Both scripts honor a `VIV_ROOT` env var if the project ever moves.
- Nothing here deletes anything; worst case, restore `data/items.json.imgbak`.
