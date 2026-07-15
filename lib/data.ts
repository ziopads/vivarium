import type { Item } from './types';
import bundled from '@/data/items.json';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSupabase } from './supabase';
import { validateItem } from './validation';
import { getViewer } from './auth';

const DATA_FILE = path.join(process.cwd(), 'data', 'items.json');
const ITEMS_DIR = path.join(process.cwd(), 'public', 'items');

// ---------------------------------------------------------------------------
// Hybrid row <-> Item mapping. Shared spine lives in typed columns; everything
// else lives in the JSONB `attributes` bag.
// ---------------------------------------------------------------------------
const COLUMN_KEYS = new Set([
  'id', 'itemType', 'title', 'author', 'year', 'section', 'shelf', 'genres',
  'subjects', 'places', 'visibility', 'owner', 'signed', 'maine', 'cover',
  'copyright', 'image', 'images', 'description', 'discussion',
]);

type Row = Record<string, any>;

function itemToRow(it: Item): Row {
  const attributes: Record<string, any> = {};
  for (const [k, v] of Object.entries(it)) {
    if (!COLUMN_KEYS.has(k)) attributes[k] = v;
  }
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
    visibility: it.visibility === 'restricted' ? 'restricted' : 'public',
    owner: it.owner || null,
    signed: !!it.signed,
    maine: !!it.maine,
    cover: it.cover || null,
    copyright: it.copyright || null,
    image: it.image ?? null,
    images: it.images || [],
    description: it.description || '',
    discussion: it.discussion || null,
    attributes,
    updated_at: new Date().toISOString(),
  };
}

function rowToItem(row: Row): Item {
  const attrs = row.attributes || {};
  return {
    // defaults for the required-string fields that live in `attributes`
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
  } as Item;
}

// ---------------------------------------------------------------------------
// Local-file helpers (used when Supabase is not configured)
// ---------------------------------------------------------------------------
async function readLocalItems(): Promise<Item[]> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')) as Item[];
  } catch {
    return bundled as unknown as Item[];
  }
}

function humanize(stem: string): string {
  return stem
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Local mode only: rebuild a gallery by scanning public/items/<id6>/ so that
// moving image files between folders re-associates them on refresh.
async function scanImages(
  id: number,
  cover: string | undefined,
): Promise<{ src: string; label: string }[]> {
  const id6 = String(id).padStart(6, '0');
  let files: string[];
  try {
    files = await fs.readdir(path.join(ITEMS_DIR, id6));
  } catch {
    return [];
  }
  const stems = files
    .filter((f) => f.endsWith('.webp') && !f.endsWith('-thumb.webp'))
    .map((f) => f.slice(0, -'.webp'.length))
    .sort();
  const imgs = stems.map((s) => ({ src: `${id6}/${s}`, label: humanize(s) }));
  const ci = imgs.findIndex((im) => im.src === cover);
  if (ci > 0) imgs.unshift(imgs.splice(ci, 1)[0]);
  return imgs;
}

async function withScannedImages(items: Item[]): Promise<Item[]> {
  return Promise.all(
    items.map(async (it) => {
      const scanned = await scanImages(it.id, it.cover);
      if (scanned.length === 0) return it;
      return { ...it, images: scanned, image: scanned[0].src };
    }),
  );
}

// ---------------------------------------------------------------------------
// Public API — database-aware, with local-file fallback
// ---------------------------------------------------------------------------
export async function getItems(): Promise<Item[]> {
  const sb = getSupabase();
  if (sb) {
    // Supabase caps a single select at 1000 rows ("Max rows"), so page through ALL
    // of them. Without this the catalogue silently truncates past 1000 items — and
    // that truncated read then made writeLocalItems delete the overflow. Keep the paging.
    const PAGE = 1000;
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from('items')
        .select('*')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Supabase getItems: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows.map(rowToItem);
  }
  return withScannedImages(await readLocalItems());
}

// Display helper: `restricted` items are visible only to admins — hidden from
// the public AND from signed-in non-admin family. Write paths use getItems (all).
export async function getVisibleItems(): Promise<Item[]> {
  const items = await getItems();
  const { isAdmin } = await getViewer();
  return isAdmin ? items : items.filter((i) => i.visibility !== 'restricted');
}

export async function getItem(id: number): Promise<Item | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('items').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase getItem: ${error.message}`);
    return data ? rowToItem(data) : null;
  }
  const it = (await readLocalItems()).find((i) => i.id === id);
  if (!it) return null;
  const scanned = await scanImages(it.id, it.cover);
  return scanned.length ? { ...it, images: scanned, image: scanned[0].src } : it;
}

// Persists the full desired item set. In Supabase mode this upserts every item
// and deletes any rows no longer present (handling create/update/delete
// uniformly — which is why the existing routes need no changes). In local mode
// it writes the JSON file. NOTE: upsert-all-on-write is simple and safe but not
// the most efficient; if saves feel slow we can switch to targeted writes.
export async function writeLocalItems(items: Item[]): Promise<void> {
  const clean = items.map(validateItem);
  const sb = getSupabase();
  if (sb) {
    const rows = clean.map(itemToRow);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from('items').upsert(rows.slice(i, i + 500), { onConflict: 'id' });
      if (error) throw new Error(`Supabase upsert: ${error.message}`);
    }
    const keep = new Set(clean.map((i) => i.id));
    // Page through ALL existing ids (the 1000-row cap applies to this select too).
    const existingIds: number[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('items').select('id').order('id').range(from, from + 999);
      if (error) throw new Error(`Supabase select ids: ${error.message}`);
      existingIds.push(...(data || []).map((r: Row) => r.id));
      if (!data || data.length < 1000) break;
    }
    const toDelete = existingIds.filter((id) => !keep.has(id));
    // Safety guard: an in-app save removes 0–1 items. A large deletion means the
    // caller was handed a partial/truncated set — refuse rather than nuke live rows.
    // (Upserts above have already persisted; only the destructive delete is skipped.)
    if (toDelete.length > 10) {
      throw new Error(
        `writeLocalItems: refusing to delete ${toDelete.length} rows in one write — ` +
        `this looks like a truncated read, not an intentional bulk delete. Nothing deleted.`,
      );
    }
    if (toDelete.length) {
      const { error: delErr } = await sb.from('items').delete().in('id', toDelete);
      if (delErr) throw new Error(`Supabase delete: ${delErr.message}`);
    }
    return;
  }
  await fs.writeFile(DATA_FILE, JSON.stringify(clean, null, 1), 'utf8');
}
