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
import { canView, normalizeVisibility } from './visibility';
import { rewritePrefix } from './taxonomy';

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
  'id', 'itemType', 'title', 'author', 'year', 'classification', 'section', 'shelf',
  'genres', 'subjects', 'places', 'visibility', 'owner', 'signed', 'maine', 'cover',
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
    // Written from the validated item, where section and shelf have already been
    // reconciled against the path, so the three can never disagree in a row.
    classification: it.classification || null,
    section: it.section || null,
    shelf: it.shelf || null,
    genres: it.genres || [],
    subjects: it.subjects || [],
    places: it.places || [],
    visibility: normalizeVisibility(it.visibility),
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
    classification: row.classification || '',
    section: row.section || '',
    shelf: row.shelf || '',
    genres: row.genres || [],
    subjects: row.subjects || [],
    places: row.places || [],
    visibility: normalizeVisibility(row.visibility),
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

// Display helper: every record the viewer's tier reaches. `public` is everyone
// through the site gate, `signed_in` adds viewers with a session, `admin` is
// admins only. See lib/visibility.ts. Write paths use getItems — all records,
// whatever their tier — because an admin editing the catalogue must see all of it.
export async function getVisibleItems(): Promise<Item[]> {
  const items = await getItems();
  const viewer = await getViewer();
  return items.filter((i) => canView(i, viewer));
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

// ---------------------------------------------------------------------------
// Targeted row operations
//
// getItems + writeLocalItems is O(catalogue) per edit: it reads every row, runs
// validateItem over all of them, upserts all of them, then pages the id list
// again to compute deletions. Fine for one edit an hour; the reason shelving 500
// books an afternoon is not currently possible.
//
// These touch one row, or the named rows, and nothing else. Two consequences
// worth stating:
//
//   - Concurrent edits stop clobbering each other. The full-set path has
//     last-write-wins semantics over the WHOLE catalogue, so a save that starts
//     before another and lands after it silently reverts the other's field.
//   - The >10 delete guard in writeLocalItems stays exactly as it is. It exists
//     to stop a truncated read from emptying the table, and a deliberate bulk
//     delete should not be the reason it gets loosened. deleteItems does not go
//     through that path at all.
// ---------------------------------------------------------------------------

// Item field -> Postgres column, for the typed spine. Anything absent lives in
// the JSONB `attributes` tail (publisher, isbn, condition, location, notes,
// source, pricePaid, the frame dimensions, …). Derived from itemToRow above;
// the two must agree.
const ITEM_TO_COLUMN: Record<string, string> = {
  itemType: 'item_type', title: 'title', author: 'author', year: 'year',
  classification: 'classification', section: 'section', shelf: 'shelf',
  genres: 'genres', subjects: 'subjects',
  places: 'places', visibility: 'visibility', owner: 'owner', signed: 'signed',
  maine: 'maine', cover: 'cover', copyright: 'copyright', image: 'image',
  images: 'images', description: 'description', discussion: 'discussion',
};

/**
 * The three columns that record where an item is filed. They are written as a
 * set or not at all: `classification` is the path, `section` and `shelf` are its
 * first two segments, and validateItem reconciles them. Writing one without the
 * others is what would let them drift.
 */
const FILING_COLUMNS = ['classification', 'section', 'shelf'];

/**
 * Records filed at `prefix` or anywhere beneath it, as id and current path.
 *
 * Two queries rather than one `.or()`: PostgREST splits an or-filter on commas,
 * so a node name containing one would silently become two conditions. Names can
 * hold almost anything — "Art, Class and Cleavage" is a real title in this
 * catalogue — so the split form is the safe one.
 *
 * LIKE metacharacters in the prefix are escaped for the same reason: a name with
 * a percent sign in it would otherwise match far more than itself.
 */
async function itemsUnder(prefix: string): Promise<{ id: number; classification: string }[]> {
  const sb = getSupabase()!;
  const escaped = prefix.replace(/([\\%_])/g, '\\$1');

  const [exact, below] = await Promise.all([
    sb.from('items').select('id, classification').eq('classification', prefix),
    sb.from('items').select('id, classification').like('classification', `${escaped}/%`),
  ]);
  if (exact.error) throw new Error(`Supabase itemsUnder: ${exact.error.message}`);
  if (below.error) throw new Error(`Supabase itemsUnder: ${below.error.message}`);

  return [...(exact.data || []), ...(below.data || [])] as { id: number; classification: string }[];
}

/**
 * Move every record at or under `from` to the same position under `to`.
 *
 * The whole point is what it does NOT do. The vocabulary route used to read the
 * entire catalogue, mutate the matching records in memory and write all 1,900
 * rows back — for a rename that touched nine of them. This reads only the
 * affected rows and writes only those, grouped by their new path, so the cost
 * follows the size of the change rather than the size of the library.
 *
 * Local mode has no row granularity: the file is the row, so it keeps the
 * read-modify-write it always had.
 */
export async function rewriteClassifications(from: string, to: string): Promise<number> {
  if (!from || from === to) return 0;

  if (dataSource().mode !== 'supabase') {
    const items = await readLocalItems();
    let n = 0;
    for (const it of items) {
      const next = rewritePrefix(it.classification || '', from, to);
      if (next !== null) {
        it.classification = next;
        n++;
      }
    }
    if (n) await writeLocalItems(items);
    return n;
  }

  const affected = await itemsUnder(from);
  if (!affected.length) return 0;

  // One UPDATE per distinct destination. A subtree of any shape collapses to a
  // handful of statements, since every record sharing an old path shares a new one.
  const groups = new Map<string, number[]>();
  for (const row of affected) {
    const next = rewritePrefix(row.classification || '', from, to);
    if (next === null) continue;
    const g = groups.get(next);
    if (g) g.push(row.id);
    else groups.set(next, [row.id]);
  }

  let updated = 0;
  for (const [classification, ids] of groups) {
    updated += await setColumns(ids, { classification });
  }
  return updated;
}

/**
 * Unfile every record at or under `prefix`.
 *
 * All three filing columns are cleared, not just the path: validateItem rebuilds
 * an empty classification FROM section and shelf, so clearing the path alone
 * would regenerate it from the stale pair and the records would stay filed under
 * something that no longer exists.
 */
export async function clearClassificationsUnder(prefix: string): Promise<number> {
  if (!prefix) return 0;

  if (dataSource().mode !== 'supabase') {
    const items = await readLocalItems();
    let n = 0;
    for (const it of items) {
      const p = it.classification || '';
      if (p && (p === prefix || p.startsWith(`${prefix}/`))) {
        it.classification = '';
        it.section = '';
        it.shelf = '';
        n++;
      }
    }
    if (n) await writeLocalItems(items);
    return n;
  }

  const affected = await itemsUnder(prefix);
  if (!affected.length) return 0;
  return setColumns(affected.map((r) => r.id), { classification: '' });
}

/**
 * Apply a partial patch to one item. Returns the updated item, or null when no
 * such id exists.
 *
 * The patch is merged into the current record and run through validateItem, so
 * normalization is identical to the full-set path — no second set of rules to
 * drift. Only the columns the patch actually named are written.
 *
 * NOTE on `location`: it is not a typed column, it lives in `attributes`.
 * Patching it therefore rewrites that row's whole attributes object, which is
 * why the current record is read first rather than the patch being sent blind.
 * Six of the seven fields left blank by ingest are columns; location is the odd
 * one out.
 */
export async function updateItem(id: number, patch: Record<string, any>): Promise<Item | null> {
  const keys = Object.keys(patch).filter((k) => k !== 'id');
  if (!keys.length) return getItem(id);

  const touchesAttributes = keys.some((k) => !ITEM_TO_COLUMN[k]);

  // A patch naming section or shelf without a path cannot be resolved from the
  // patch alone: `{ shelf: 'Poetry' }` says nothing about which section it sits
  // under, and the fast path never reads the record. Reading it is the only way
  // to rebuild the full path, so such a patch takes the slow path. A patch that
  // carries `classification` is self-contained and stays on the fast one.
  const partialFiling =
    !keys.includes('classification') && (keys.includes('section') || keys.includes('shelf'));

  // Whatever the patch named, all three filing columns are written together.
  const columnsFor = (named: string[]) =>
    named.some((k) => FILING_COLUMNS.includes(k))
      ? Array.from(new Set([...named, ...FILING_COLUMNS]))
      : named;

  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;

    if (!touchesAttributes && !partialFiling) {
      const row = itemToRow(validateItem({ id, ...patch }));
      const update: Row = { updated_at: row.updated_at };
      for (const k of columnsFor(keys)) update[ITEM_TO_COLUMN[k]] = row[ITEM_TO_COLUMN[k]];

      const { data, error } = await sb
        .from('items')
        .update(update)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(`Supabase updateItem: ${error.message}`);
      return data ? rowToItem(data) : null;
    }

    const { data, error } = await sb.from('items').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase updateItem read: ${error.message}`);
    if (!data) return null;

    const current = rowToItem(data);
    // The path is rebuilt from the merged section and shelf rather than carried
    // over from the record, which would otherwise win in validateItem and revert
    // the very field the patch was setting.
    const merged = validateItem(
      partialFiling
        ? { ...current, ...patch, id, classification: '' }
        : { ...current, ...patch, id },
    );
    const row = itemToRow(merged);

    const update: Row = { updated_at: row.updated_at, attributes: row.attributes };
    for (const k of columnsFor(keys)) {
      const col = ITEM_TO_COLUMN[k];
      if (col) update[col] = row[col];
    }

    const { error: upErr } = await sb.from('items').update(update).eq('id', id);
    if (upErr) throw new Error(`Supabase updateItem: ${upErr.message}`);
    return merged;
  }

  const items = await readLocalItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const merged = validateItem(
    partialFiling
      ? { ...items[idx], ...patch, id, classification: '' }
      : { ...items[idx], ...patch, id },
  );
  items[idx] = merged;
  // Local mode has no row granularity — the file is the row. Still one write.
  await writeLocalItems(items);
  return merged;
}

/**
 * Apply the same patch to many items in one pass. Returns the ids actually
 * changed; ids that don't exist are skipped rather than erroring, so a stale
 * selection can't fail the whole batch.
 *
 * Deliberately NOT a single UPDATE ... WHERE id IN (...): validateItem needs each
 * record's current state, and a patch that touches `attributes` is per-row by
 * nature. This is O(selection), which is the point — it is not O(catalogue).
 */
export async function updateItems(
  ids: number[],
  patch: Record<string, any>,
): Promise<number[]> {
  const unique = Array.from(new Set(ids.map(Number).filter(Number.isFinite)));
  const done: number[] = [];
  for (const id of unique) {
    const out = await updateItem(id, patch);
    if (out) done.push(id);
  }
  return done;
}

/**
 * The next free id, without reading the catalogue. `POST /api/items/new` does
 * this by pulling every record and taking the max, which is another
 * O(catalogue) read for one number.
 *
 * Ids are never reused: a deleted record's id stays retired, so a wish coming
 * back from the wishlist gets a fresh one rather than reclaiming the id it had
 * before it left.
 */
export async function nextItemId(): Promise<number> {
  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
    const { data, error } = await sb
      .from('items')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase nextItemId: ${error.message}`);
    return (data?.id ?? 0) + 1;
  }
  const items = await readLocalItems();
  return items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
}

/** Insert one record. Fails if the id is taken rather than overwriting it. */
export async function createItem(item: Item): Promise<Item> {
  const clean = validateItem(item);
  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
    const { error } = await sb.from('items').insert(itemToRow(clean));
    if (error) throw new Error(`Supabase createItem: ${error.message}`);
    return clean;
  }
  const items = await readLocalItems();
  if (items.some((i) => i.id === clean.id)) {
    throw new Error(`createItem: id ${clean.id} already exists`);
  }
  await writeLocalItems([...items, clean]);
  return clean;
}

/**
 * Set the same typed-column values on many rows in one statement per chunk.
 *
 * updateItems loops updateItem, which is right when each row needs its own
 * treatment, and wrong for a bulk assignment where every selected row is
 * getting the same value: a thousand rows would be a thousand round trips.
 * This is one UPDATE per 200 ids.
 *
 * Column fields only — anything in the JSONB tail has to merge per row and
 * belongs on updateItems. Throws rather than silently skipping, so a caller
 * cannot think it wrote `location` here.
 */
export async function setColumns(
  ids: number[],
  patch: Record<string, any>,
): Promise<number> {
  const unique = Array.from(new Set(ids.map(Number).filter(Number.isFinite)));
  const keys = Object.keys(patch).filter((k) => k !== 'id');
  if (!unique.length || !keys.length) return 0;

  const bad = keys.filter((k) => !ITEM_TO_COLUMN[k]);
  if (bad.length) {
    throw new Error(`setColumns: ${bad.join(', ')} are not typed columns — use updateItems`);
  }

  // Every selected row gets the same value here, so a filing change has to be a
  // complete path. `{ section: 'X' }` across a selection would mean rebuilding a
  // path per row from each row's own shelf, which is what updateItems is for.
  if ((keys.includes('section') || keys.includes('shelf')) && !keys.includes('classification')) {
    throw new Error(
      'setColumns: filing a selection needs `classification`, the full path — ' +
        'section and shelf are derived from it',
    );
  }

  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
    const row = itemToRow(validateItem({ id: 0, ...patch }));
    const update: Row = { updated_at: new Date().toISOString() };
    const write = keys.some((k) => FILING_COLUMNS.includes(k))
      ? Array.from(new Set([...keys, ...FILING_COLUMNS]))
      : keys;
    for (const k of write) update[ITEM_TO_COLUMN[k]] = row[ITEM_TO_COLUMN[k]];

    let changed = 0;
    for (let i = 0; i < unique.length; i += 200) {
      const chunk = unique.slice(i, i + 200);
      const { data, error } = await sb.from('items').update(update).in('id', chunk).select('id');
      if (error) throw new Error(`Supabase setColumns: ${error.message}`);
      changed += (data || []).length;
    }
    return changed;
  }

  const items = await readLocalItems();
  const target = new Set(unique);
  let changed = 0;
  const next = items.map((i) => {
    if (!target.has(i.id)) return i;
    changed++;
    return validateItem({ ...i, ...patch });
  });
  if (changed) await writeLocalItems(next);
  return changed;
}

/**
 * Delete the named rows. Returns the ids that were actually removed, which is
 * how a caller distinguishes "deleted 340" from "asked for 340, 338 existed".
 *
 * This is the bulk-delete path. It carries no size guard on purpose: the guard
 * in writeLocalItems protects against an accidental delete implied by a
 * truncated read, and that hazard does not exist here because the ids are named
 * explicitly. Confirmation belongs at the UI boundary, where the operator can
 * see what is about to go.
 *
 * Does NOT remove images — neither the local public/items/<id6>/ folders nor the
 * R2 objects. Callers that delete records with images must handle that.
 */
export async function deleteItems(ids: number[]): Promise<number[]> {
  const unique = Array.from(new Set(ids.map(Number).filter(Number.isFinite)));
  if (!unique.length) return [];

  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
    const removed: number[] = [];
    // Chunked: the id list goes into the request URL, and a few hundred ids is
    // where that starts to get long.
    for (let i = 0; i < unique.length; i += 200) {
      const chunk = unique.slice(i, i + 200);
      const { data, error } = await sb.from('items').delete().in('id', chunk).select('id');
      if (error) throw new Error(`Supabase deleteItems: ${error.message}`);
      removed.push(...(data || []).map((r: Row) => r.id));
    }
    return removed;
  }

  const items = await readLocalItems();
  const drop = new Set(unique);
  const keep = items.filter((i) => !drop.has(i.id));
  const removed = items.filter((i) => drop.has(i.id)).map((i) => i.id);
  if (removed.length) {
    await fs.writeFile(
      ACTIVE_FILE,
      JSON.stringify(keep.map(validateItem), null, 1),
      'utf8',
    );
  }
  return removed;
}
