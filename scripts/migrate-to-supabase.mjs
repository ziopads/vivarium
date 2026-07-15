// FULL RESEED of Supabase from local JSON (hybrid schema: typed columns + attributes).
//
// ⚠️  DANGER — this UPSERTS EVERY row by id (items, vocab, wishlist). If Supabase holds
//     edits that are newer than your local data/items.json, this OVERWRITES them with the
//     stale local copy. That has bitten us before. It is NOT an incremental tool.
//
//     • To add NEW items only, use  scripts/seed-new-items.mjs  (insert-only, aborts on
//       id collision).
//     • Before any incremental work, run  scripts/sync_from_supabase.mjs  to pull live
//       down first.
//     • Use THIS script only for a true from-scratch reseed of an EMPTY / disposable DB.
//
// Requires an explicit acknowledgement flag so it can't run by accident:
//   node --env-file=.env.local scripts/migrate-to-supabase.mjs --full-reseed
//
// Run AFTER creating the project and running supabase/schema.sql.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
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

const items = JSON.parse(readFileSync(path.join(root, 'data', 'items.json'), 'utf8'));
const vocab = JSON.parse(readFileSync(path.join(root, 'data', 'vocab.json'), 'utf8'));

// Fields promoted to typed columns; everything else falls into `attributes`.
const COLUMN_KEYS = new Set([
  'id', 'itemType', 'title', 'author', 'year', 'section', 'shelf', 'genres',
  'subjects', 'places', 'visibility', 'owner', 'signed', 'maine', 'cover',
  'copyright', 'image', 'images', 'description', 'discussion',
]);

function toRow(it) {
  const attributes = {};
  for (const [k, v] of Object.entries(it)) {
    if (!COLUMN_KEYS.has(k)) attributes[k] = v;
  }
  const vis = it.visibility === 'restricted' ? 'restricted' : 'public';
  return {
    id: it.id,
    item_type: it.itemType || 'Book',
    title: it.title || '',
    author: it.author || '',
    year: it.year || '',
    section: it.section || null,
    shelf: it.shelf || null,
    genres: it.genres || [],
    subjects: it.subjects || [],
    places: it.places || [],
    visibility: vis,
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

// Wishlist — transform the old flat entries into the tracked shape.
let wishes = [];
try {
  wishes = JSON.parse(readFileSync(path.join(root, 'data', 'wishlist.json'), 'utf8'));
} catch {
  /* no wishlist file — skip */
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

console.log(`Done — seeded ${rows.length} items, vocab, ${wrows.length} wishlist entries.`);
