import type { Item } from './types';
// First-run fallback only, used when data/items.json does not exist yet. The real
// file is gitignored — it is the operator's catalogue, not part of the app — so a
// fresh clone compiles and runs against these three example records instead.
import bundled from '@/data/items.example.json';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSupabase } from './supabase';
import { validateItem } from './validation';
import { getViewer } from './auth';

const DATA_FILE = path.join(process.cwd(), 'data', 'items.json');

// ---------------------------------------------------------------------------
// Which dataset is live?
//
// LOCAL_DATA_FILE names a JSON file relative to the project root. Setting it
// FORCES local mode even when Supabase is configured — naming a dataset is an
// unambiguous statement about which one you want to work against. Unset,
// behaviour is exactly as before: Supabase when configured, else data/items.json.
//
// The mode is computed once here and used by every read AND write below. They
// must never disagree: reading one store while writing to another would upsert
// one dataset into the other and then delete-guard its way through the
// difference.
// ---------------------------------------------------------------------------
const EXPLICIT_DATA_FILE = process.env.LOCAL_DATA_FILE?.trim() || null;

const ACTIVE_FILE = EXPLICIT_DATA_FILE
  ? path.resolve(process.cwd(), EXPLICIT_DATA_FILE)
  : DATA_FILE;

export type DataSource = {
  mode: 'supabase' | 'local';
  /** Absolute path to the JSON file backing local mode; null in supabase mode. */
  file: string | null;
  /** True when LOCAL_DATA_FILE named this dataset explicitly. */
  explicit: boolean;
  /** Short label for the dev badge, e.g. "local · items.tamplin.json". */
  label: string;
};

export function dataSource(): DataSource {
  if (EXPLICIT_DATA_FILE) {
    return {
      mode: 'local',
      file: ACTIVE_FILE,
      explicit: true,
      label: `local · ${path.basename(ACTIVE_FILE)}`,
    };
  }
  if (getSupabase()) {
    return { mode: 'supabase', file: null, explicit: false, label: 'supabase' };
  }
  return {
    mode: 'local',
    file: ACTIVE_FILE,
    explicit: false,
    label: `local · ${path.basename(ACTIVE_FILE)}`,
  };
}

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
// Local-file helpers (used when Supabase is not configured, or when
// LOCAL_DATA_FILE names a dataset explicitly)
// ---------------------------------------------------------------------------
async function readLocalItems(): Promise<Item[]> {
  let raw: string;
  try {
    raw = await fs.readFile(ACTIVE_FILE, 'utf8');
  } catch (err: any) {
    if (EXPLICIT_DATA_FILE) {
      // Falling back here would serve a different dataset than the one named —
      // the precise commingling LOCAL_DATA_FILE exists to prevent.
      throw new Error(
        `LOCAL_DATA_FILE is set to "${EXPLICIT_DATA_FILE}" but that file could not be read ` +
          `(${err?.code || err?.message}). Refusing to fall back to the bundled snapshot.`,
      );
    }
    // Default path only: a missing data/items.json is the first-run case.
    return bundled as unknown as Item[];
  }

  try {
    return JSON.parse(raw) as Item[];
  } catch (err: any) {
    // A file that exists but will not parse is corruption, never first-run.
    // The old code fell back to the compiled-in snapshot here, and the next
    // save would persist that stale set over the real file.
    throw new Error(`Could not parse ${ACTIVE_FILE}: ${err?.message}`);
  }
}

// ---------------------------------------------------------------------------
// Public API — database-aware, with local-file fallback
// ---------------------------------------------------------------------------
export async function getItems(): Promise<Item[]> {
  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
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
  // The record is authoritative in both modes. Folder scanning is an explicit
  // write now — see lib/rescan.ts.
  return readLocalItems();
}

// Display helper: `restricted` items are visible only to admins — hidden from
// the public AND from signed-in non-admin family. Write paths use getItems (all).
export async function getVisibleItems(): Promise<Item[]> {
  const items = await getItems();
  const { isAdmin } = await getViewer();
  return isAdmin ? items : items.filter((i) => i.visibility !== 'restricted');
}

export async function getItem(id: number): Promise<Item | null> {
  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('items').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase getItem: ${error.message}`);
    return data ? rowToItem(data) : null;
  }
  return (await readLocalItems()).find((i) => i.id === id) ?? null;
}

// Persists the full desired item set. In Supabase mode this upserts every item
// and deletes any rows no longer present (handling create/update/delete
// uniformly — which is why the existing routes need no changes). In local mode
// it writes the JSON file. NOTE: upsert-all-on-write is simple and safe but not
// the most efficient; if saves feel slow we can switch to targeted writes.
export async function writeLocalItems(items: Item[]): Promise<void> {
  const clean = items.map(validateItem);
  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
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
  await fs.writeFile(ACTIVE_FILE, JSON.stringify(clean, null, 1), 'utf8');
}
