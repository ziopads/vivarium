// Pull ALL items from Supabase down into local data/items.json so local mirrors live.
// READ-ONLY against Supabase (SELECT only). Backs up the existing local file first.
// Run this BEFORE apply_images.py so new ids are assigned above Supabase's true max id
// (prevents the id-collision that overwrites live records).
//
//   node --env-file=.env.local scripts/sync_from_supabase.mjs
//
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Reverse of the app's row->Item mapping (mirrors lib/data.ts rowToItem) so the local
// file round-trips cleanly back through the seed scripts (attributes preserved).
function rowToItem(row) {
  const attrs = row.attributes || {};
  return {
    publisher: '', placeOfPublication: '', edition: '', printing: '', isbn: '',
    format: '', blurb: '', inscription: '', condition: '', location: '', notes: '',
    ...attrs,
    id: row.id,
    itemType: row.item_type || 'Book',
    title: row.title || '',
    author: row.author || '',
    year: row.year || '',
    section: row.section || '',
    shelf: row.shelf || '',
    genres: row.genres || [],
    subjects: row.subjects || [],
    places: row.places || [],
    visibility: row.visibility || 'public',
    owner: row.owner || '',
    signed: !!row.signed,
    maine: !!row.maine,
    cover: row.cover || undefined,
    copyright: row.copyright || undefined,
    image: row.image ?? null,
    images: row.images || [],
    description: row.description || '',
    discussion: row.discussion || undefined,
  };
}

const PAGE = 1000;
let rows = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase.from('items').select('*').order('id').range(from, from + PAGE - 1);
  if (error) { console.error('select failed:', error.message); process.exit(1); }
  rows = rows.concat(data);
  if (data.length < PAGE) break;
}
if (!rows.length) { console.error('Supabase returned 0 items — refusing to overwrite local. Check credentials.'); process.exit(1); }

const items = rows.map(rowToItem);
const maxId = items.reduce((m, i) => Math.max(m, i.id), 0);
const dest = path.join(process.cwd(), 'data', 'items.json');
if (existsSync(dest)) copyFileSync(dest, dest + '.syncdownbak');
writeFileSync(dest, JSON.stringify(items, null, 1), 'utf8');
console.log(`Pulled ${items.length} items from Supabase -> ${dest}`);
console.log(`True max id = ${maxId}. New records should start at ${maxId + 1}. (local backup: items.json.syncdownbak)`);
