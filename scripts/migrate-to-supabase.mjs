// FULL RESEED of Supabase from local JSON (hybrid schema: typed columns + attributes).
//
// ⚠️  DANGER — this UPSERTS EVERY row by id (items, vocab, wishlist). If Supabase holds
//     edits that are newer than your local data/items.json, this OVERWRITES them with the
//     stale local copy. That has bitten us before. It is NOT an incremental tool.
//
//     • To add NEW items only, use  scripts/seed-new-items.mjs  (insert-only, aborts on
//       id collision).
//     • Before any incremental work, run  sync_from_supabase.mjs  (in the batch processor)
//       to pull live down first.
//     • Use THIS script only for a true from-scratch reseed of an EMPTY / disposable DB.
//
// Requires an explicit acknowledgement flag so it can't run by accident:
//   node --env-file=.env.local scripts/migrate-to-supabase.mjs --full-reseed
//
// Run AFTER creating the project and running supabase/schema.sql.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

if (!process.argv.includes('--full-reseed')) {
  console.error('REFUSING TO RUN: this upserts EVERY row and can overwrite live edits.');
  console.error('If you truly want a full from-scratch reseed of a disposable DB, pass --full-reseed.');
  console.error('To add new items safely instead, use scripts/seed-new-items.mjs (insert-only).');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const root = process.cwd();

// Which dataset seeds which database. LOCAL_DATA_FILE names the items file (the
// same var the app uses to switch instances); vocab AND wishlist are derived from
// it, matching lib/vocab.ts. Unset = the library's data/items.json, as before.
//
// THE WISHLIST PATH USED TO BE HARDCODED to data/wishlist.json while items and
// vocab honoured LOCAL_DATA_FILE. So a seed aimed at a second instance carried
// the library's wishlist into it — which is how nineteen of James's books ended
// up in the Tamplin catalogue's database, found on 10 September 2026. Any path
// derived from the dataset must be derived in one place; that is this block.
const ITEMS_FILE = process.env.LOCAL_DATA_FILE
  ? path.resolve(root, process.env.LOCAL_DATA_FILE)
  : path.join(root, 'data', 'items.json');
const base = path.basename(ITEMS_FILE);
const suffix = base.startsWith('items') ? base.slice('items'.length) : '.json';
const dir = path.dirname(ITEMS_FILE);
const VOCAB_FILE = path.join(dir, 'vocab' + suffix);
const WISHLIST_FILE = path.join(dir, 'wishlist' + suffix);

console.log(
  `Seeding FROM:\n  items:    ${path.relative(root, ITEMS_FILE)}\n` +
    `  vocab:    ${path.relative(root, VOCAB_FILE)}\n` +
    `  wishlist: ${path.relative(root, WISHLIST_FILE)}${existsSync(WISHLIST_FILE) ? '' : ' (absent — skipping)'}`,
);
console.log(`Seeding INTO: ${url}\n`);

const items = JSON.parse(readFileSync(ITEMS_FILE, 'utf8'));
const vocab = JSON.parse(readFileSync(VOCAB_FILE, 'utf8'));

// Fields promoted to typed columns; everything else falls into `attributes`.
//
// `classification` was missing here until 10 September 2026, so a reseed dropped
// every record's filing path into the JSONB bag and left the column null — the
// column the app treats as authoritative and every subtree query indexes on.
// Row-mapping drift is a standing hazard in this project: apply_images.py,
// merge_records.py and handoff.py each hold their own copy of this list.
const COLUMN_KEYS = new Set([
  'id', 'itemType', 'title', 'author', 'year', 'classification', 'section', 'shelf',
  'genres', 'subjects', 'places', 'visibility', 'owner', 'signed', 'maine', 'cover',
  'copyright', 'image', 'images', 'description', 'discussion',
]);

/**
 * Visibility, in the vocabulary the CHECK constraint actually permits.
 *
 * This used to read `it.visibility === 'restricted' ? 'restricted' : 'public'`,
 * written before the 2026-09-03 rename and never updated. Two failures came out
 * of it: `restricted` is no longer a legal value, so a record holding it aborted
 * the seed partway; and `signed_in` and `admin` both collapsed to `public`,
 * publishing closed records with nothing on screen to say so.
 *
 * The legacy aliases mirror lib/visibility.ts. Anything unrecognised is treated
 * as the CLOSED tier rather than the open one — a seed is not the place to guess
 * generously about who may see a record.
 */
const LEGACY_VISIBILITY = { restricted: 'admin', link: 'signed_in' };
const VISIBILITY = new Set(['public', 'signed_in', 'admin']);
function visibilityOf(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return 'public';
  if (VISIBILITY.has(v)) return v;
  if (LEGACY_VISIBILITY[v]) return LEGACY_VISIBILITY[v];
  console.warn(`  unrecognised visibility ${JSON.stringify(v)} — seeding as admin`);
  return 'admin';
}

/** The filing path, and the two derived mirrors, exactly as validateItem builds them. */
function filingOf(it) {
  const section = (it.section || '').trim();
  const shelf = (it.shelf || '').trim();
  const stated = (it.classification || '').trim();
  const classification = stated || [section, shelf].filter(Boolean).join('/');
  if (!classification) return { classification: null, section: null, shelf: null };
  const segs = classification.split('/').map((s) => s.trim()).filter(Boolean);
  return {
    classification,
    section: segs[0] || null,
    shelf: segs[1] || null,
  };
}

function toRow(it) {
  const attributes = {};
  for (const [k, v] of Object.entries(it)) {
    if (!COLUMN_KEYS.has(k)) attributes[k] = v;
  }
  const filing = filingOf(it);
  return {
    id: it.id,
    item_type: it.itemType || 'Book',
    title: it.title || '',
    author: it.author || '',
    year: it.year || '',
    classification: filing.classification,
    section: filing.section,
    shelf: filing.shelf,
    genres: it.genres || [],
    subjects: it.subjects || [],
    places: it.places || [],
    visibility: visibilityOf(it.visibility),
    owner: it.owner || null,
    signed: !!it.signed,
    maine: !!it.maine,
    cover: it.cover || null,
    copyright: it.copyright || null,
    image: it.image || null,
    images: it.images || [],
    description: it.description || '',
    discussion: it.discussion || null,
    attributes,
  };
}

const rows = items.map(toRow);

// What is about to be written, before it is written. A seed that silently
// changed who can see a record is the failure this reports on.
const visCounts = {};
for (const r of rows) visCounts[r.visibility] = (visCounts[r.visibility] || 0) + 1;
console.log('visibility:', visCounts);
console.log(`classification set on ${rows.filter((r) => r.classification).length} of ${rows.length}\n`);

const CHUNK = 500;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const { error } = await supabase.from('items').upsert(chunk, { onConflict: 'id' });
  if (error) {
    console.error('items upsert failed:', error.message);
    process.exit(1);
  }
  console.log(`items ${i + chunk.length}/${rows.length}`);
}

const { error: vErr } = await supabase.from('vocab').upsert({ id: 1, data: vocab }, { onConflict: 'id' });
if (vErr) {
  console.error('vocab upsert failed:', vErr.message);
  process.exit(1);
}

// Wishlist — transform the old flat entries into the tracked shape. Absent is a
// normal state for an instance that has never had one.
let wishes = [];
if (existsSync(WISHLIST_FILE)) {
  wishes = JSON.parse(readFileSync(WISHLIST_FILE, 'utf8'));
}
const owner = (process.env.AUTH_ADMINS || '').split(',')[0].trim() || 'unknown';
const wrows = wishes.map((w, i) => {
  const id = typeof w.id === 'number' ? w.id : i + 1;
  return {
    id,
    data: {
      id,
      title: w.title || '',
      author: w.author || '',
      section: w.section || '',
      note: w.note || undefined,
      image: w.image || undefined,
      addedBy: w.addedBy || owner,
      createdAt: w.createdAt || new Date().toISOString(),
    },
  };
});
if (wrows.length) {
  const { error: wErr } = await supabase.from('wishlist').upsert(wrows, { onConflict: 'id' });
  if (wErr) {
    console.error('wishlist upsert failed:', wErr.message);
    process.exit(1);
  }
}

console.log(`\nDone — seeded ${rows.length} items, vocab, ${wrows.length} wishlist entries.`);
