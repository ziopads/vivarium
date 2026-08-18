// Pull the vocabulary from Supabase down into local data/vocab.json so local mirrors live.
// READ-ONLY against Supabase (SELECT only). Backs up the existing local file first.
//
// WHY THIS EXISTS: lib/vocab.ts stores the whole Vocab object as a single row
// (table `vocab`, id = 1, JSON in the `data` column) whenever the app is in Supabase
// mode. Edits made in /admin/vocab on the deployed app therefore never touch
// data/vocab.json — but scripts/ingest_batch.py validates every incoming record
// against that local file. Without this sync the two drift apart silently, and a
// section added live gets rejected locally while a section deleted live still passes.
//
// Run this BEFORE ingest_batch.py, alongside sync_from_supabase.mjs.
//
//   node --env-file=.env.local scripts/sync_vocab_from_supabase.mjs
//
// Set VOCAB_FILE to target a non-default instance (e.g. data/vocab.tamplin.json),
// mirroring the resolution lib/vocab.ts performs.
//
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase.from('vocab').select('data').eq('id', 1).maybeSingle();
if (error) { console.error('select failed:', error.message); process.exit(1); }
if (!data?.data) {
  console.error('Supabase holds no vocab row — refusing to overwrite local. '
    + 'Either the instance has never saved vocab, or the credentials point elsewhere.');
  process.exit(1);
}

const v = data.data;
if (!Array.isArray(v.sections) || !v.sections.length) {
  console.error('Remote vocab has no sections — refusing to overwrite local.');
  process.exit(1);
}

const dest = process.env.VOCAB_FILE
  ? path.resolve(process.cwd(), process.env.VOCAB_FILE)
  : path.join(process.cwd(), 'data', 'vocab.json');

// Report the delta before writing: silent vocabulary changes are how records get
// assigned to sections that no longer exist.
if (existsSync(dest)) {
  try {
    const before = JSON.parse(readFileSync(dest, 'utf8'));
    const diff = (a = [], b = []) => ({
      added: b.filter((x) => !a.includes(x)),
      removed: a.filter((x) => !b.includes(x)),
    });
    const s = diff(before.sections, v.sections);
    const g = diff(before.genres, v.genres);
    const report = (label, d) => {
      if (d.added.length) console.log(`  ${label} added:   ${d.added.join(', ')}`);
      if (d.removed.length) console.log(`  ${label} removed: ${d.removed.join(', ')}`);
    };
    report('sections', s);
    report('genres', g);
    const beforeShelves = Object.keys(before.shelvesBySection || {});
    const afterShelves = Object.keys(v.shelvesBySection || {});
    const sh = diff(beforeShelves, afterShelves);
    report('shelf-sections', sh);
    if (!s.added.length && !s.removed.length && !g.added.length && !g.removed.length
        && !sh.added.length && !sh.removed.length) {
      console.log('  (no section/genre changes; shelf lists may still differ)');
    }
  } catch {
    console.log('  (local vocab unreadable — writing remote over it)');
  }
  copyFileSync(dest, dest + '.syncdownbak');
}

writeFileSync(dest, JSON.stringify(v, null, 2), 'utf8');
console.log(`Pulled vocab from Supabase -> ${dest}`);
console.log(`  ${v.sections.length} sections, ${(v.genres || []).length} genres, `
  + `${Object.keys(v.shelvesBySection || {}).length} sections with shelves`);
if (existsSync(dest + '.syncdownbak')) console.log(`  (local backup: ${path.basename(dest)}.syncdownbak)`);
