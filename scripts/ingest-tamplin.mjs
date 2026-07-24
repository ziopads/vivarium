#!/usr/bin/env node
/**
 * ingest-tamplin.mjs
 * ---------------------------------------------------------------------------
 * Maps cr-working/works.json into a vivarium Item[] at data/items.tamplin.json,
 * and publishes the image tree by symlinking id-named folders at the CR#-named
 * ones the pipeline built.
 *
 * IDS ARE TRUE SURROGATES. They are assigned once, in catalogue order, and are
 * never derived from the CR number — because CR numbers change (two already
 * needed normalizing, nine works have no title, one has `$` as a title, and the
 * Monjoy/Munjoy spelling is unresolved). A derived id would turn every such
 * correction into a folder rename and a rewrite of every stored image path.
 *
 * Re-ingest is therefore idempotent WITHOUT being derived: existing ids are
 * looked up by refNumber from the previous output, which is the system of
 * record once written. New works get the next free id. Nothing is renumbered.
 *
 * ---------------------------------------------------------------------------
 * FOLDERS ARE ID-NAMED, FILENAMES ARE CR#-NAMED
 *
 *   public/<imageDir>/000042/xVMT-1955-001_web.jpg
 *          └ id: which record          └ catalogue number: which work
 *
 * The trace runs both directions. In production the same key is an R2 object
 * key and the symlink is replaced by an upload; only the host changes.
 * ---------------------------------------------------------------------------
 *
 * USAGE
 *   node scripts/ingest-tamplin.mjs --dry-run
 *   node scripts/ingest-tamplin.mjs
 *   node scripts/ingest-tamplin.mjs --no-links     # data only, skip symlinks
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SRC = path.join(ROOT, 'cr-working', 'works.json');
const IMAGES_SRC = path.join(ROOT, 'cr-working', 'images');
const OUT = path.join(ROOT, 'data', 'items.tamplin.json');

// Must match NEXT_PUBLIC_LOCAL_IMAGE_DIR in .env.local, or the browser will ask
// for a folder that was never linked.
const IMAGE_DIR = (process.env.NEXT_PUBLIC_LOCAL_IMAGE_DIR || 'items-tamplin')
  .replace(/^\/+|\/+$/g, '');
const PUBLIC_DIR = path.join(ROOT, 'public', IMAGE_DIR);

const ARTIST = 'Valerie Tamplin';

// The four subject categories, seeded into the instance vocabulary on first run.
// Seascapes fold into Landscape by decision, not oversight.
const SECTIONS = ['Abstract', 'Figurative', 'Landscape', 'Still Life'];

// A template placeholder left in the workbook — nine works carry it. Not a
// medium, not a rule failure: a question for Valerie. Reported separately so it
// never hides inside the unmatched pile.
const MEDIUM_MISSING = /insert all material|^\s*\[.*\]\s*$/i;

// Medium string → itemType. First match wins, so order matters: a collage
// incorporating acrylic is a collage, and an aquatint is a print even though
// the sheet may also say "ink". Medium keeps the fine grain ("oil on canvas");
// itemType answers only what kind of object it is.
//
// Word boundaries are load-bearing. `etch` without one matches SKETCH, which
// filed 69 drawings as prints; `cont[eé]` without one matches CONTEMPORARY.
// Misspellings present in the workbook are matched deliberately rather than
// corrected upstream, so the catalogue stays the record of what was written.
const MEDIUM_RULES = [
  [/coll?age|assemblage|found object|beachcombed/i, 'Collage & Assemblage'],
  [
    /aquatint|\betch|drypoint|engrav|lithograph|serigraph|screen\s?print|silkscreen|woodcut|linocut|linoleum|monotype|monoprint|intaglio|mezzotint/i,
    'Print',
  ],
  [
    /sculpt|bronze|plaster|terra\s?cotta|ceramic|carved|welded|marble|alabaster|\bcast\b|laminated|redwood|\bwood\b/i,
    'Sculpture',
  ],
  [
    /graphite|pencil|charcoal|\bcont[e\u00e9]\b|pastel|crayon|silverpoint|sanguine|chalk|\bink\b|drawing|sketch/i,
    'Drawing',
  ],
  [
    /oil|acryl|scrylic|watercolo|g[ou]*ache|casein|tempera|encaustic|alkyd|latex|enam[ae]l|canvas|panel|masonite|board/i,
    'Painting',
  ],
];

function classify(medium) {
  const m = String(medium || '').trim();
  if (!m) return { type: 'Painting', matched: false, missing: true };
  if (MEDIUM_MISSING.test(m)) return { type: 'Painting', matched: false, missing: true };
  for (const [re, type] of MEDIUM_RULES) {
    if (re.test(m)) return { type, matched: true, missing: false };
  }
  return { type: 'Painting', matched: false, missing: false };
}

const argv = new Set(process.argv.slice(2));
const DRY = argv.has('--dry-run');
const NO_LINKS = argv.has('--no-links');
// itemType is derived for NEW works only, so a manual correction in the app is
// never clobbered by a re-run. Pass --reclassify to re-derive everything after
// improving the rules below.
const RECLASSIFY = argv.has('--reclassify');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const log = (...a) => console.log(...a);
const id6 = (n) => String(n).padStart(6, '0');

// ── load ───────────────────────────────────────────────────────────────────
if (!existsSync(SRC)) {
  console.error(c.red(`\n  ✗ ${SRC} not found. Run: node scripts/build-cr-images.mjs\n`));
  process.exit(1);
}
const works = JSON.parse(await fs.readFile(SRC, 'utf8')).works ?? [];

// Previous output is the id authority. Absent = first run.
let existing = [];
if (existsSync(OUT)) {
  try {
    existing = JSON.parse(await fs.readFile(OUT, 'utf8'));
  } catch (err) {
    console.error(c.red(`\n  ✗ ${OUT} exists but will not parse: ${err.message}`));
    console.error(c.dim('    Refusing to continue — overwriting it would discard the id map.\n'));
    process.exit(1);
  }
}

const idByRef = new Map();
const prevByRef = new Map();
let maxId = 0;
for (const it of existing) {
  const ref = it?.refNumber ?? it?.attributes?.refNumber;
  if (ref) {
    idByRef.set(String(ref), it.id);
    prevByRef.set(String(ref), it);
  }
  if (typeof it?.id === 'number') maxId = Math.max(maxId, it.id);
}

log(c.bold(`\n  Valerie Tamplin — ingest to vivarium Item[]`));
log(
  c.dim(
    `  works: ${works.length}   existing ids: ${idByRef.size}   ` +
      `image dir: public/${IMAGE_DIR}/   mode: ${DRY ? 'DRY RUN' : 'write'}\n`,
  ),
);

// ── map ────────────────────────────────────────────────────────────────────
const str = (v) => (v == null ? '' : String(v).trim());

/** Nine works have no title; VMT-2006-015 has `$` from a stray keystroke. An
 *  empty title is honest — the UI can render "Untitled" without the data
 *  asserting one. */
function cleanTitle(v) {
  const t = str(v);
  return t === '$' ? '' : t;
}

function labelFor(img) {
  return img.variant ? `View ${String(img.variant).toUpperCase()}` : '';
}

/** works.json records a coverImage; match it loosely, since it may hold a stem
 *  or a filename. Falls back to the first image. */
function pickCover(work, mapped) {
  const want = str(work.coverImage);
  if (want && work.images?.length) {
    const i = work.images.findIndex((im) =>
      [im.stem, im.sourceFile, im.web, im.full, im.thumb].some((v) => v && str(v) === want),
    );
    if (i >= 0) return mapped[i];
  }
  return mapped[0] ?? null;
}

const items = [];
const assigned = [];
const noImages = [];
const untitled = [];
const unmatched = new Map();   // medium string → count
const noMedium = [];           // works whose medium was never recorded
const typeCounts = new Map();

for (const w of works) {
  const ref = str(w.crNumber) || str(w.id);
  const prev = prevByRef.get(ref);
  let id = idByRef.get(ref);
  if (id == null) {
    id = ++maxId;
    assigned.push({ id, ref });
  }

  const dir = id6(id);
  const mapped = (w.images ?? []).map((im) => ({
    src: `${dir}/${im.stem}`,
    label: labelFor(im),
    files: {
      thumb: `${dir}/${im.thumb}`,
      web: `${dir}/${im.web}`,
      // null is meaningful: no zoom tier exists for this source.
      zoom: im.zoom ? `${dir}/${im.zoom}` : null,
      full: `${dir}/${im.full}`,
    },
  }));

  // Preserve the app's own cover choice when the file still exists.
  const keptCover =
    prev?.cover && mapped.some((m) => m.src === prev.cover)
      ? mapped.find((m) => m.src === prev.cover)
      : null;
  const cover = keptCover ?? pickCover(w, mapped);

  const title = cleanTitle(w.title);
  if (!title) untitled.push(ref);
  if (!mapped.length) noImages.push({ ref, title: title || '(untitled)' });

  // Derive for new works; keep any manual correction otherwise.
  const guess = classify(w.medium);
  const itemType = prev && !RECLASSIFY ? prev.itemType || guess.type : guess.type;
  typeCounts.set(itemType, (typeCounts.get(itemType) || 0) + 1);
  if (!guess.matched) {
    if (guess.missing) {
      noMedium.push(ref);
    } else {
      const key = str(w.medium) || '(blank)';
      unmatched.set(key, (unmatched.get(key) || 0) + 1);
    }
  }

  items.push({
    id,
    itemType,
    title,
    author: ARTIST,
    year: str(w.yearFromCR ?? w.year),
    images: mapped,
    image: cover ? cover.src : null,
    ...(cover ? { cover: cover.src } : {}),

    // ── app-owned: assigned in the UI, never derived from the workbook ──
    section: prev?.section ?? '',
    visibility: prev?.visibility ?? 'public',
    genres: prev?.genres ?? [],
    subjects: prev?.subjects ?? [],
    places: prev?.places ?? [],
    shelf: prev?.shelf ?? '',
    description: prev?.description ?? '',
    ...(prev?.discussion ? { discussion: prev.discussion } : {}),
    owner: prev?.owner ?? '',
    signed: prev?.signed ?? false,
    maine: prev?.maine ?? false,

    // ── attributes tail (not in COLUMN_KEYS, lands in JSONB automatically) ──
    refNumber: ref,
    medium: str(w.medium),
    dimensions: str(w.dimensions),
    framing: str(w.framing),
    exhibitions: str(w.exhibitions),
    bibliography: str(w.bibliography),
    status: str(w.status),
    provenance: str(w.provenance),
    price: str(w.price),
    realizedPrice: str(w.realizedPrice),
    invoice: str(w.invoice),
    saleHistory: str(w.saleHistory),
    index: str(w.index),
    notes: str(w.notes),

    // Traceability back to the source workbook and pipeline.
    photoStatus: str(w.photoStatus),
    sourceRow: w.sheetRow ?? null,
    sourceDir: str(w.imageDir) || ref,
  });
}

items.sort((a, b) => a.id - b.id);

log(`  items:        ${items.length}`);
log(`  ids reused:   ${items.length - assigned.length}`);
log(`  ids assigned: ${assigned.length ? c.green(assigned.length) : 0}`);

log(c.bold(`\n  item types`) + c.dim(RECLASSIFY ? '  (re-derived)' : '  (derived for new works only)'));
for (const [t, n] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
  log(`      ${String(n).padStart(4)}  ${t}`);
}
if (unmatched.size) {
  log(
    c.yellow(`\n  ⚠ ${[...unmatched.values()].reduce((a, b) => a + b, 0)} work(s) whose medium matched no rule`) +
      c.dim(' — defaulted to Painting:'),
  );
  for (const [m, n] of [...unmatched.entries()].sort((a, b) => b[1] - a[1])) {
    log(c.yellow(`      ${String(n).padStart(4)}  ${m}`));
  }
  log(c.dim(`    Refine MEDIUM_RULES, then re-run with --reclassify.`));
}
if (noMedium.length) {
  log(c.yellow(`\n  ⚠ ${noMedium.length} work(s) have no medium recorded — type is a guess:`));
  log(c.dim(`      ${noMedium.join(', ')}`));
  log(c.dim(`    The workbook holds a template placeholder here. Needs Valerie.`));
}

if (untitled.length) log(c.yellow(`\n  untitled:     ${untitled.length}  ${c.dim(untitled.join(', '))}`));
if (noImages.length) {
  log(c.yellow(`  no images:    ${noImages.length}`));
  for (const n of noImages) log(c.yellow(`      ${n.ref}  ${n.title}`));
}

// ── write ──────────────────────────────────────────────────────────────────
if (!DRY) {
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  if (existsSync(OUT)) await fs.copyFile(OUT, OUT + '.ingestbak');
  await fs.writeFile(OUT, JSON.stringify(items, null, 1) + '\n');
  log(c.green(`\n  ✓ ${path.relative(ROOT, OUT)}`));

  // Seed the instance vocabulary, so a fresh clone opens with the four subject
  // categories rather than the bookshop's Fiction/Poetry/History defaults.
  // Never overwritten — /admin/vocab owns it after first run.
  const base = path.basename(OUT);
  const VOCAB = path.join(
    path.dirname(OUT),
    base.startsWith('items') ? 'vocab' + base.slice('items'.length) : `vocab.${base}`,
  );
  if (!existsSync(VOCAB)) {
    await fs.writeFile(
      VOCAB,
      JSON.stringify({ sections: SECTIONS, genres: [], shelvesBySection: {} }, null, 2) + '\n',
    );
    log(c.green(`  ✓ ${path.relative(ROOT, VOCAB)}`) + c.dim('  (seeded)'));
  }
}

// ── publish images ─────────────────────────────────────────────────────────
// Local stand-in for the production R2 upload: the same CR# → id mapping,
// applied to the filesystem instead of to object keys.
if (!NO_LINKS) {
  let made = 0,
    ok = 0,
    missing = 0,
    conflicts = 0;

  if (!DRY) await fs.mkdir(PUBLIC_DIR, { recursive: true });

  for (const it of items) {
    const target = path.join(IMAGES_SRC, it.sourceDir);
    const link = path.join(PUBLIC_DIR, id6(it.id));
    const rel = path.relative(PUBLIC_DIR, target);

    if (!existsSync(target)) {
      missing++;
      continue;
    }
    let cur = null;
    try {
      cur = await fs.readlink(link);
    } catch {
      // not a symlink, or absent
    }
    if (cur === rel) {
      ok++;
      continue;
    }
    if (cur === null && existsSync(link)) {
      // A real directory sits where the link should go — never clobber it.
      log(c.red(`      ✗ ${IMAGE_DIR}/${id6(it.id)} exists and is not a symlink — skipped`));
      conflicts++;
      continue;
    }
    if (!DRY) {
      if (cur !== null) await fs.unlink(link);
      await fs.symlink(rel, link);
    }
    made++;
  }

  log(c.dim(`\n  symlinks: ${made} created, ${ok} already correct`));
  if (missing) log(c.yellow(`            ${missing} source folder(s) missing (works with no images)`));
  if (conflicts) log(c.red(`            ${conflicts} conflict(s) — see above`));
}

if (DRY) {
  log(c.dim('\n  dry run — nothing written, no links created.\n'));
} else {
  log(c.dim(`\n  .env.local must contain:`));
  log(c.dim(`    LOCAL_DATA_FILE=data/items.tamplin.json`));
  log(c.dim(`    NEXT_PUBLIC_LOCAL_IMAGE_DIR=${IMAGE_DIR}\n`));
}
