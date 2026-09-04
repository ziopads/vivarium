import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';
import { getVocab, writeVocab, tidyVocab, type VocabKind } from '@/lib/vocab';
import {
  addNode,
  renameNode,
  removeNode,
  reorderChildren,
  moveNode,
  childrenAt,
  findNode,
  isValidName,
  itemUnderPath,
  formatPath,
} from '@/lib/taxonomy';

// POST /api/vocab
//
// Two shapes, both admin-guarded by middleware:
//
//   { kind: 'genres',   action: 'add'|'rename'|'delete', value, newValue? }
//   { kind: 'sections', action: 'add'|'rename'|'delete', value, newValue? }
//   { kind: 'shelves',  action: 'add'|'rename'|'delete', value, newValue?, section }
//   { kind: 'path',     action: 'add'|'rename'|'delete'|'reorder'|'move',
//                       path?: string[], parent?: string[], value?, order?: string[],
//                       index?: number }
//
// The first three are the original wire contract, kept so the existing editor
// works unchanged. They are now thin wrappers: a section is a top-level node, a
// shelf is that node's child. `path` is the general form and reaches any depth.
//
// Renames and deletes cascade to items through `section` and `shelf`, which is
// all an item currently stores. A rename at depth three or below therefore
// touches no records — nothing is filed that deep yet. That changes when items
// gain a path of their own.
export async function POST(req: Request) {
  let body: {
    kind?: VocabKind | 'path';
    action?: 'add' | 'rename' | 'delete' | 'reorder' | 'move';
    value?: string;
    newValue?: string;
    section?: string;
    path?: string[];
    parent?: string[];
    order?: string[];
    index?: number;
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

  if (!kind || !['sections', 'genres', 'shelves', 'path'].includes(kind)) {
    return NextResponse.json({ error: 'Unknown vocabulary kind' }, { status: 400 });
  }
  if (!action) return NextResponse.json({ error: 'No action' }, { status: 400 });

  const vocab = await getVocab();
  const items = await getItems();
  let affected = 0;

  const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

  const save = async () => {
    if (affected) await writeLocalItems(items);
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
    return save();
  }

  if (!path.length) return bad('Empty value');
  if (!findNode(vocab.tree, path)) return bad('No such entry', 404);

  const target = path[path.length - 1];
  const depth = path.length;

  if (action === 'move') {
    const dest = segs(body.parent);
    const newDepth = dest.length + 1;
    const filed = items.filter((it) => itemUnderPath(it, path)).length;

    // The refusal that matters. An item records where it sits in `section` and
    // `shelf` and nowhere else, so there is no way to say that a book is at
    // depth three. Allowing the move would leave those records pointing at a
    // level that no longer describes them, and nothing on screen would show it.
    if (newDepth > 2 && filed > 0) {
      return bad(
        `${target} holds ${filed} item${filed === 1 ? '' : 's'}, and ${formatPath([...dest, target])} ` +
          `is three levels deep. Items can only record two levels until they carry a path of their own. ` +
          `Move it once that lands, or empty it first.`,
      );
    }

    const result = moveNode(vocab.tree, path, dest, body.index);
    if (result === 'nowhere') return bad(`${target} is already there`);
    if (result === 'cycle') return bad(`Cannot move ${target} inside itself`);
    if (result === 'duplicate') return bad(`${formatPath(dest) || 'The top level'} already has a ${target}`);
    if (result !== 'ok') return bad('No such entry', 404);

    // Cascade, for the two depths an item can express.
    if (newDepth === 1) {
      // Promoted to a section. Records filed under it take its name as their
      // section; whatever shelf they named went with the promotion.
      for (const it of items) {
        if (depth === 1 ? it.section === target : it.section === path[0] && it.shelf === target) {
          it.section = target;
          it.shelf = '';
          affected++;
        }
      }
    } else if (newDepth === 2) {
      const owner = dest[0];
      for (const it of items) {
        if (depth === 1 ? it.section === target : it.section === path[0] && it.shelf === target) {
          it.section = owner;
          it.shelf = target;
          affected++;
        }
      }
    }
    return save();
  }

  if (action === 'rename') {
    if (!isValidName(newValue)) return bad('A new name is required, and may not contain /');
    if (!renameNode(vocab.tree, path, newValue)) {
      return bad(`Could not rename — ${newValue} may already exist alongside it`);
    }
    // Cascade. Depth 1 is a section, depth 2 a shelf within its parent section;
    // deeper nodes have nothing filed under them yet.
    if (depth === 1) {
      for (const it of items) {
        if (it.section === target) {
          it.section = newValue;
          affected++;
        }
      }
    } else if (depth === 2) {
      const owner = path[0];
      for (const it of items) {
        if (it.section === owner && it.shelf === target) {
          it.shelf = newValue;
          affected++;
        }
      }
    }
    return save();
  }

  if (action === 'delete') {
    const removed = removeNode(vocab.tree, path);
    if (!removed) return bad('No such entry', 404);
    // Deleting a node takes its children with it, so clearing the item fields has
    // to match: removing a section clears both fields on its records, since the
    // shelf they named went with it.
    if (depth === 1) {
      for (const it of items) {
        if (it.section === target) {
          it.section = '';
          it.shelf = '';
          affected++;
        }
      }
    } else if (depth === 2) {
      const owner = path[0];
      for (const it of items) {
        if (it.section === owner && it.shelf === target) {
          it.shelf = '';
          affected++;
        }
      }
    }
    return save();
  }

  return bad('Unknown action');
}
