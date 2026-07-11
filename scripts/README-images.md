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

## Cleanup & notes
- After a successful apply you can empty `image-intake/` and `image-ready/`.
- New-item defaults (location `Maine`, owner `James`) are constants at the top of
  `apply_images.py` — edit them if a batch belongs elsewhere.
- Both scripts honor a `VIV_ROOT` env var if the project ever moves.
- Nothing here deletes anything; worst case, restore `data/items.json.imgbak`.
