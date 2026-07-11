// Seed Supabase from the local JSON files (hybrid schema: typed columns + attributes).
//
//   npm i @supabase/supabase-js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-to-supabase.mjs
//
// Run AFTER creating the project and running supabase/schema.sql.
// Idempotent: upserts by id, so it's safe to re-run.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

console.log(`Done — seeded ${rows.length} items + vocab.`);
