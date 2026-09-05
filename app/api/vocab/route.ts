import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  getItems,
  writeLocalItems,
  rewriteClassifications,
  clearClassificationsUnder,
  itemTypeCountsUnder,
} from '@/lib/data';
import type { Item } from '@/lib/types';
import { getVocab, writeVocab, tidyVocab, type VocabKind } from '@/lib/vocab';
import {
  addNode,
  renameNode,
  removeNode,
  reorderChildren,
  moveNode,
  setNodeMeta,
  childrenAt,
  findNode,
  isValidName,
  formatPath,
  servesType,
  SORTS,
  type NodeSort,
} from '@/lib/taxonomy';

// POST /api/vocab
//
// Two shapes, both admin-guarded by middleware:
//
//   { kind: 'genres',   action: 'add'|'rename'|'delete', value, newValue? }
//   { kind: 'sections', action: 'add'|'rename'|'delete', value, newValue? }
//   { kind: 'shelves',  action: 'add'|'rename'|'delete', value, newValue?, section }
//   { kind: 'path',     action: 'add'|'rename'|'delete'|'reorder'|'move'|'set',
//                       path?: string[], parent?: string[], value?, order?: string[],
//                       index?: number, types?: string[]|null, sort?: string|null,
//                       force?: boolean }
//
// `types` on an ADD tags the new node as it is created; on a SET it replaces the
// node's tags. `index` on a MOVE is an index into the REAL sibling list, so a
// caller showing a filtered view has to translate before sending.
//
// The first three are the original wire contract, kept so the existing editor
// works unchanged. They are now thin wrappers: a section is a top-level node, a
// shelf is that node's child. `path` is the general form and reaches any depth.
//
// Renames, moves and deletes cascade to items through `classification`, the
// record's full path. Rewriting the prefix carries every descendant with it, so
// moving a node three levels down takes its books along; validateItem then
// rebuilds each record's section and shelf from the new path, which is why
// nothing here touches those two fields directly.
export async function POST(req: Request) {
  let body: {
    kind?: VocabKind | 'path';
    action?: 'add' | 'rename' | 'delete' | 'reorder' | 'move' | 'set';
    value?: string;
    newValue?: string;
    section?: string;
    path?: string[];
    parent?: string[];
    order?: string[];
    index?: number;
    types?: string[] | null;
    sort?: string | null;
    force?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { kind, action } = body;
  const value = (body.value || '').trim();
  const newValue = (body.newValue || '').trim();
  const section = (body.section || '').trim();
  const segs = (arr?: string[]) => (Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean) : []);

  if (!kind || !['sections', 'genres', 'shelves', 'types', 'path'].includes(kind)) {
    return NextResponse.json({ error: 'Unknown vocabulary kind' }, { status: 400 });
  }
  if (!action) return NextResponse.json({ error: 'No action' }, { status: 400 });

  const vocab = await getVocab();
  let affected = 0;

  // The catalogue is loaded ONLY for the two vocabularies that live on the item
  // rather than in the tree: genres are an array on each record and item types a
  // column, so both need a scan. Tree operations use the targeted rewrites in
  // lib/data.ts instead.
  //
  // This used to be an unconditional `await getItems()` followed, whenever
  // anything changed, by `writeLocalItems(items)` — a full read and a full
  // rewrite of every row in the library. Reordering two siblings, which touches
  // no record at all, paid for both. That was the drag latency.
  let loaded: Item[] | null = null;
  const loadItems = async () => (loaded ??= await getItems());

  const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

  const save = async () => {
    if (loaded && affected) await writeLocalItems(loaded);
    await writeVocab(vocab);
    revalidatePath('/');
    revalidatePath('/browse');
    revalidatePath('/admin/vocab');
    revalidatePath('/manage');
    return NextResponse.json({ ok: true, vocab: tidyVocab(vocab), affected });
  };

  // --- Genres (flat, cross-cutting — not part of the tree) ---
  if (kind === 'genres') {
    const list = vocab.genres;
    if (action === 'add') {
      if (value && !list.includes(value)) list.push(value);
      return save();
    }
    if (!value) return bad('Empty value');
    const idx = list.indexOf(value);
    const items = await loadItems();
    if (action === 'rename') {
      if (!newValue) return bad('Need a new value');
      if (idx !== -1) {
        if (list.includes(newValue)) list.splice(idx, 1);
        else list[idx] = newValue;
      }
      for (const it of items) {
        if (Array.isArray(it.genres) && it.genres.includes(value)) {
          it.genres = Array.from(new Set(it.genres.map((g) => (g === value ? newValue : g))));
          affected++;
        }
      }
    } else {
      if (idx !== -1) list.splice(idx, 1);
      for (const it of items) {
        if (Array.isArray(it.genres) && it.genres.includes(value)) {
          it.genres = it.genres.filter((g) => g !== value);
          affected++;
        }
      }
    }
    return save();
  }

  // --- Item types (flat, and every record has exactly one) ---
  if (kind === 'types') {
    const list = vocab.types;
    if (action === 'add') {
      if (value && !list.includes(value)) list.push(value);
      return save();
    }
    if (!value) return bad('Empty value');
    const idx = list.indexOf(value);
    const items = await loadItems();
    const inUse = (name: string) => items.filter((it) => (it.itemType || 'Book') === name).length;

    if (action === 'rename') {
      if (!newValue) return bad('Need a new value');
      if (idx !== -1) {
        if (list.includes(newValue)) list.splice(idx, 1);
        else list[idx] = newValue;
      }
      for (const it of items) {
        if ((it.itemType || 'Book') === value) {
          it.itemType = newValue;
          affected++;
        }
      }
      return save();
    }

    // Deleting a type does NOT clear it from its records, the way deleting a
    // section does. A record with no section is unfiled, which is a real state;
    // a record with no type is not, and would silently become a Book, taking
    // its type-specific fields out of view. So the delete is refused instead.
    const used = inUse(value);
    if (used) {
      return bad(
        `${used} item${used === 1 ? '' : 's'} still ${used === 1 ? 'is' : 'are'} ${value}. ` +
          `Retype them first — filter by type in /manage, select them, and set the new type.`,
      );
    }
    if (idx !== -1) list.splice(idx, 1);
    return save();
  }

  // --- Everything else is a node in the tree ---

  // Resolve the legacy kinds to a path so there is one implementation below.
  let path: string[];
  let parent: string[];
  if (kind === 'sections') {
    path = value ? [value] : [];
    parent = [];
  } else if (kind === 'shelves') {
    if (!section) return bad('Shelf changes need a section');
    path = value ? [section, value] : [];
    parent = [section];
  } else {
    path = segs(body.path);
    parent = segs(body.parent).length ? segs(body.parent) : path.slice(0, -1);
  }

  if (action === 'reorder') {
    const order = segs(body.order);
    if (!order.length) return bad('Need an order');
    if (parent.length && !findNode(vocab.tree, parent)) return bad('No such parent', 404);
    // Renaming nothing and moving nothing: reordering only rewrites the stored
    // sequence, so no item is touched and `affected` stays zero.
    if (!reorderChildren(vocab.tree, parent, order)) return bad('Nothing to reorder');
    return save();
  }

  if (action === 'add') {
    if (!isValidName(value)) return bad('A name is required, and may not contain /');
    if (parent.length && !findNode(vocab.tree, parent)) return bad('No such parent', 404);
    if (childrenAt(vocab.tree, parent).some((n) => n.name === value)) {
      return bad(`${value} is already there`);
    }
    if (!addNode(vocab.tree, parent, value)) return bad('Could not add that');

    // A root added from a type tab is tagged in the same request. addNode writes
    // `{ name }` and nothing else, and an untagged node serves EVERY type — so
    // without this, adding a shelf while looking at the Recordings tab produces a
    // root that immediately appears in every other tab too, which reads as the
    // tab being broken. Nothing can be stranded here, the node being new.
    if (Array.isArray(body.types) && body.types.length) {
      const wanted = segs(body.types);
      const unknown = wanted.filter((t) => !vocab.types.includes(t));
      if (unknown.length) return bad(`Not item types: ${unknown.join(', ')}`);
      setNodeMeta(vocab.tree, [...parent, value], { types: wanted });
    }
    return save();
  }

  if (!path.length) return bad('Empty value');
  if (!findNode(vocab.tree, path)) return bad('No such entry', 404);

  const target = path[path.length - 1];

  // Set which item types a branch serves, and how the items filed there are
  // listed. Both inherit downward from the node, so setting them on a root is
  // the normal case and setting them deeper is an override.
  //
  // Neither touches a record, so `affected` stays zero — but tagging a branch
  // CAN strand records that are already there. A book filed under a branch that
  // becomes Recording-only keeps its path, and no picker will offer that path
  // back to it. So the records under the node are counted first and the write is
  // refused when any of them would be stranded, with the count and the types, and
  // `force: true` goes through anyway. This is the same bargain bulk-classify
  // makes in the other direction.
  if (action === 'set') {
    const meta: { types?: string[] | null; sort?: NodeSort | null } = {};

    if (body.types !== undefined) {
      if (body.types !== null && !Array.isArray(body.types)) return bad('types must be a list');
      const wanted = segs(body.types ?? []);
      // Checked against the managed type list. A typo here would tag a branch
      // with a type no record can ever have, which reads as an empty picker with
      // nothing on screen to explain it.
      const unknown = wanted.filter((t) => !vocab.types.includes(t));
      if (unknown.length) {
        return bad(`Not item types: ${unknown.join(', ')}`);
      }
      meta.types = wanted;
    }

    if (body.sort !== undefined) {
      const wanted = (body.sort || '').trim();
      if (wanted && !(SORTS as readonly string[]).includes(wanted)) {
        return bad(`Sort must be one of ${SORTS.join(', ')}`);
      }
      meta.sort = (wanted || null) as NodeSort | null;
    }

    if (meta.types === undefined && meta.sort === undefined) {
      return bad('Nothing to set');
    }

    if (meta.types && meta.types.length && !body.force) {
      const counts = await itemTypeCountsUnder(formatPath(path));
      const stranded = Object.entries(counts).filter(([t]) => !servesType(meta.types!, t));
      if (stranded.length) {
        const total = stranded.reduce((n, [, c]) => n + c, 0);
        return NextResponse.json(
          {
            error:
              `${total} record${total === 1 ? '' : 's'} under ${target} ` +
              `${total === 1 ? 'is' : 'are'} ` +
              stranded.map(([t, c]) => `${t} (${c})`).join(', ') +
              `, which ${total === 1 ? 'is' : 'are'} not served by this branch. ` +
              `They keep their place and stop being offered it.`,
            stranded: stranded.map(([itemType, count]) => ({ itemType, count })),
            total,
          },
          { status: 409 },
        );
      }
    }

    if (!setNodeMeta(vocab.tree, path, meta)) return bad(`${target} is already like that`);
    return save();
  }

  if (action === 'move') {
    const dest = segs(body.parent);

    const result = moveNode(vocab.tree, path, dest, body.index);
    if (result === 'nowhere') return bad(`${target} is already there`);
    if (result === 'cycle') return bad(`Cannot move ${target} inside itself`);
    if (result === 'duplicate') return bad(`${formatPath(dest) || 'The top level'} already has a ${target}`);
    if (result !== 'ok') return bad('No such entry', 404);

    // Every record at or under the old path follows the node to its new one —
    // read and written targeted, so the cost is the size of the branch rather
    // than the size of the library.
    affected = await rewriteClassifications(formatPath(path), formatPath([...dest, target]));
    return save();
  }

  if (action === 'rename') {
    if (!isValidName(newValue)) return bad('A new name is required, and may not contain /');
    if (!renameNode(vocab.tree, path, newValue)) {
      return bad(`Could not rename — ${newValue} may already exist alongside it`);
    }
    affected = await rewriteClassifications(
      formatPath(path),
      formatPath([...path.slice(0, -1), newValue]),
    );
    return save();
  }

  if (action === 'delete') {
    const removed = removeNode(vocab.tree, path);
    if (!removed) return bad('No such entry', 404);
    // Deleting takes the subtree with it, so every record at or under the path
    // is unfiled rather than left pointing at somewhere that no longer exists.
    affected = await clearClassificationsUnder(formatPath(path));
    return save();
  }

  return bad('Unknown action');
}
