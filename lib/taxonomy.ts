import type { Item } from './types';

/**
 * The classification tree.
 *
 * One ordered tree of names. A record's classification is the path to a node,
 * stored as a single string: `History & Place/Americas/Maine & New England`.
 *
 * WHY A PATH RATHER THAN COLUMNS. Depth was the recurring problem. Section and
 * shelf gave two levels, and the vocabulary had already grown a third by hand —
 * `Body: Food`, `Psychology: Cultural` are an area layer written into the name;
 * `_AUDIO`, `_OBJECTS` use a leading underscore to defeat alphabetical sort.
 * Fixed columns would have moved the wall from two levels to four. A path has
 * no wall.
 *
 * WHY ORDER IS STORED, NOT COMPUTED. Alphabetical order is not neutral. It puts
 * Africa before Americas before Asia, files `Maine & New England` between
 * `Eastern` and `Medieval`, and generally arranges a collection by the accident
 * of initial letters. Children sit in the order they are given, at every level,
 * and every view is expected to preserve it.
 *
 * The type axis is deliberately absent. `itemType` already separates books from
 * frames from recordings, and it drives which edit fields a record shows, which
 * a path segment cannot do. Encoding it here too would give two fields asserting
 * one fact.
 */

/** Path separator. Forbidden inside a node name — see isValidName. */
export const SEP = '/';

/**
 * How the ITEMS filed at a node are listed when you browse into it.
 *
 * Distinct from the order of the node's children, which is always the curated
 * order they are stored in. A classical shelf wants its records chronological
 * and a soundtrack shelf wants them alphabetical, and that is a property of the
 * material rather than something to re-choose on every visit.
 *
 * Inherited from the nearest ancestor that sets one; `title` when none does.
 */
export const SORTS = ['manual', 'title', 'author', 'year'] as const;
export type NodeSort = (typeof SORTS)[number];

export type TaxonNode = {
  name: string;
  /**
   * The item types this branch serves. Absent means every type, which is what
   * every node written before this field existed is — so an untagged vocabulary
   * keeps working unchanged, on this instance and on Tamplin's.
   *
   * Meaningful on a root and inherited by everything under it. A record shelf
   * and a book shelf have almost nothing in common, so a Recording tagged branch
   * never appears in a book's picker.
   */
  types?: string[];
  /** How items filed here are listed. Inherited. See SORTS. */
  sort?: NodeSort;
  children?: TaxonNode[];
};

export function isValidName(name: string): boolean {
  const t = name.trim();
  return t.length > 0 && !t.includes(SEP);
}

export function parsePath(path: string | undefined | null): string[] {
  if (!path) return [];
  return path.split(SEP).map((s) => s.trim()).filter(Boolean);
}

export function formatPath(segments: string[]): string {
  return segments.map((s) => s.trim()).filter(Boolean).join(SEP);
}

/**
 * Coerce arbitrary stored JSON into a well-formed tree.
 *
 * Applied on every read, so a hand-edited vocabulary cannot put a malformed node
 * into circulation. Unnamed nodes, names containing the separator, and duplicate
 * siblings are dropped rather than repaired: a duplicate sibling would make one
 * path refer to two nodes, and there is no way to guess which was meant.
 *
 * EVERY FIELD A NODE CARRIES HAS TO BE LISTED HERE. This runs on the way in AND
 * on the way out — writeVocab tidies before it saves — so a property this
 * function does not copy is silently dropped on the next read, with no error and
 * nothing in the response to notice. `types` and `sort` are the two beyond
 * `name` and `children`.
 */
export function sanitizeTree(raw: unknown): TaxonNode[] {
  if (!Array.isArray(raw)) return [];
  const out: TaxonNode[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const name = String((entry as any).name ?? '').trim();
    if (!isValidName(name) || seen.has(name)) continue;
    seen.add(name);
    const children = sanitizeTree((entry as any).children);

    const rawTypes = (entry as any).types;
    const types = Array.isArray(rawTypes)
      ? Array.from(new Set(rawTypes.map((t: unknown) => String(t ?? '').trim()).filter(Boolean)))
      : [];

    const rawSort = String((entry as any).sort ?? '').trim() as NodeSort;
    const sort = (SORTS as readonly string[]).includes(rawSort) ? rawSort : undefined;

    const node: TaxonNode = { name };
    // An empty list is stored as absent, so "serves nothing" cannot be written by
    // accident — a node no type can reach would be invisible everywhere.
    if (types.length) node.types = types;
    if (sort) node.sort = sort;
    if (children.length) node.children = children;
    out.push(node);
  }
  return out;
}

/** The node at a path, or null. */
export function findNode(tree: TaxonNode[], segments: string[]): TaxonNode | null {
  let level = tree;
  let node: TaxonNode | null = null;
  for (const seg of segments) {
    node = level.find((n) => n.name === seg) || null;
    if (!node) return null;
    level = node.children || [];
  }
  return node;
}

/** The children of a path. An empty path returns the top level. */
export function childrenAt(tree: TaxonNode[], segments: string[]): TaxonNode[] {
  if (!segments.length) return tree;
  return findNode(tree, segments)?.children || [];
}

export function pathExists(tree: TaxonNode[], segments: string[]): boolean {
  return segments.length > 0 && findNode(tree, segments) !== null;
}

/** Depth-first, in stored order. */
export function walk(
  tree: TaxonNode[],
  visit: (node: TaxonNode, path: string[]) => void,
  prefix: string[] = [],
): void {
  for (const node of tree) {
    const path = [...prefix, node.name];
    visit(node, path);
    if (node.children?.length) walk(node.children, visit, path);
  }
}

/** Every path in the tree, in stored order. */
export function allPaths(tree: TaxonNode[]): string[][] {
  const out: string[][] = [];
  walk(tree, (_n, path) => out.push(path));
  return out;
}

/** Paths with no children — the places a record can actually be filed. */
export function leafPaths(tree: TaxonNode[]): string[][] {
  const out: string[][] = [];
  walk(tree, (node, path) => {
    if (!node.children?.length) out.push(path);
  });
  return out;
}

/**
 * Every path in the tree as a pickable option, in stored order.
 *
 * Interior nodes are included, not just leaves. `Regions & Cultures/Asia` is a
 * real place to file something even once South Asia exists under it — a general
 * book about Asia belongs there and nowhere more specific, and forcing it down
 * to a leaf would invent a precision the book does not have.
 */
export type PathOption = { path: string; depth: number; name: string };

export function pathOptions(tree: TaxonNode[]): PathOption[] {
  const out: PathOption[] = [];
  walk(tree, (node, path) => {
    out.push({ path: formatPath(path), depth: path.length - 1, name: node.name });
  });
  return out;
}

/** Is `path` at `prefix`, or anywhere beneath it? */
export function isUnderPath(path: string, prefix: string): boolean {
  if (!prefix) return true;
  return path === prefix || path.startsWith(prefix + SEP);
}

// --- Type scoping and item sort ---------------------------------------------
//
// A record collection and a book collection are different taxonomies, not two
// sizes of one. Classical goes chronological, soundtracks alphabetical, world
// music by geography, rock by subgenre; none of that belongs anywhere near
// Literature or Maritime. So a branch declares which item types it serves, and
// the editor shows one tab per type.
//
// The declaration lives on the node and NOT in the path. `classification` stays
// one global namespace, which is what lets rewritePrefix, itemsUnder and
// bulk-classify carry on unchanged: one path is one place, whatever type of
// object is filed there. The only constraint it buys is that root names must be
// unique across the whole vocabulary, since the root is what disambiguates.

/** Does a branch tagged `types` serve `itemType`? Untagged serves everything. */
export function servesType(types: string[] | undefined, itemType: string): boolean {
  if (!types || !types.length) return true;
  return types.includes(itemType);
}

/**
 * Walk a path and return the value of `pick` on the DEEPEST node that sets one,
 * or undefined. Both `types` and `sort` inherit this way: set on a root and
 * everything beneath follows, override anywhere down the branch.
 */
function inherited<T>(
  tree: TaxonNode[],
  segments: string[],
  pick: (n: TaxonNode) => T | undefined,
): T | undefined {
  let level = tree;
  let found: T | undefined;
  for (const seg of segments) {
    const node = level.find((n) => n.name === seg);
    if (!node) return found;
    const v = pick(node);
    if (v !== undefined) found = v;
    level = node.children || [];
  }
  return found;
}

/** The types serving a path, inherited. undefined means every type. */
export function typesAt(tree: TaxonNode[], segments: string[]): string[] | undefined {
  return inherited(tree, segments, (n) => (n.types?.length ? n.types : undefined));
}

/** How items filed at a path are listed, inherited. `title` when nothing sets one. */
export function sortAt(tree: TaxonNode[], segments: string[]): NodeSort {
  return inherited(tree, segments, (n) => n.sort) ?? 'title';
}

/** Is this path one an item of `itemType` may be filed at? */
export function pathServesType(tree: TaxonNode[], path: string, itemType: string): boolean {
  if (!path) return true;
  return servesType(typesAt(tree, parsePath(path)), itemType);
}

/**
 * The roots one tab shows. Filtering stops at the top level: tags are meaningful
 * on a root, and a child that overrode its root's tags would put one branch in
 * two tabs with no way to say which one owns its order.
 */
export function rootsForType(tree: TaxonNode[], itemType: string): TaxonNode[] {
  return tree.filter((n) => servesType(n.types, itemType));
}

/**
 * Pickable paths for one item type.
 *
 * PRUNED AT EVERY LEVEL, not just at the root, and that is deliberate. Tabs
 * filter roots only, because a tab has to own a branch's order and a child
 * overriding its root's tags would put one branch in two tabs. A PICKER has no
 * such constraint, and it has to agree with pathServesType — which reads the
 * deepest `types` on the path, so a Recording-only shelf under a shared root is
 * a path a book may not be filed at. Offering it here and refusing it at the
 * write would produce exactly the mis-filed rows the /manage flag is meant to
 * catch. Same rule, computed the same way, in both places.
 *
 * The paths are real paths into the real tree, so every mutation still
 * addresses them by name; nothing here renumbers anything.
 */
export function pathOptionsForType(tree: TaxonNode[], itemType: string): PathOption[] {
  const out: PathOption[] = [];
  const descend = (nodes: TaxonNode[], prefix: string[], from: string[] | undefined) => {
    for (const node of nodes) {
      // The same inheritance typesAt walks: a node's own tags win, otherwise it
      // keeps whatever the nearest tagged ancestor said.
      const types = node.types?.length ? node.types : from;
      if (!servesType(types, itemType)) continue;
      const path = [...prefix, node.name];
      out.push({ path: formatPath(path), depth: path.length - 1, name: node.name });
      if (node.children?.length) descend(node.children, path, types);
    }
  };
  descend(tree, [], undefined);
  return out;
}

/**
 * The same, for several types at once, keyed by type.
 *
 * The list view holds a mixed set of records and each row's picker has to offer
 * that row's own branches. Computing per row would repeat the walk seventeen
 * hundred times; there are a handful of types, so it is computed once per type
 * and looked up.
 */
export function pathOptionsByType(
  tree: TaxonNode[],
  itemTypes: string[],
): Record<string, PathOption[]> {
  const out: Record<string, PathOption[]> = {};
  for (const raw of itemTypes) {
    const t = (raw || '').trim() || 'Book';
    if (!out[t]) out[t] = pathOptionsForType(tree, t);
  }
  if (!out.Book) out.Book = pathOptionsForType(tree, 'Book');
  return out;
}

/**
 * Rewrite a stored path when the node it names is renamed or moved.
 *
 * Returns null when the path is untouched. Matching is on whole segments —
 * `startsWith(from)` alone would rewrite `Art & Music` when `Art` moved, and
 * every record in the wrong section would follow it.
 */
export function rewritePrefix(path: string, from: string, to: string): string | null {
  if (!path || !from) return null;
  if (path === from) return to;
  if (path.startsWith(from + SEP)) return to + path.slice(from.length);
  return null;
}

// --- Mutation. Each operates in place and reports whether anything changed. ---

export function addNode(tree: TaxonNode[], parent: string[], name: string): boolean {
  if (!isValidName(name)) return false;
  const siblings = parent.length ? findNode(tree, parent)?.children ?? null : tree;
  if (parent.length && !siblings) {
    const node = findNode(tree, parent);
    if (!node) return false;
    node.children = [{ name: name.trim() }];
    return true;
  }
  if (!siblings) return false;
  if (siblings.some((n) => n.name === name.trim())) return false;
  siblings.push({ name: name.trim() });
  return true;
}

/**
 * Rename in place, keeping position.
 *
 * Refuses when a sibling already holds the new name. Merging two nodes means
 * merging their subtrees and rewriting every record filed under either, which is
 * a different operation and should be asked for explicitly.
 */
export function renameNode(tree: TaxonNode[], segments: string[], newName: string): boolean {
  if (!segments.length || !isValidName(newName)) return false;
  const parent = segments.slice(0, -1);
  const current = segments[segments.length - 1];
  const siblings = childrenAt(tree, parent);
  const node = siblings.find((n) => n.name === current);
  if (!node) return false;
  const target = newName.trim();
  if (target === current) return false;
  if (siblings.some((n) => n.name === target)) return false;
  node.name = target;
  return true;
}

/** Remove a node and everything under it. Returns the detached subtree. */
export function removeNode(tree: TaxonNode[], segments: string[]): TaxonNode | null {
  if (!segments.length) return null;
  const parent = segments.slice(0, -1);
  const name = segments[segments.length - 1];
  const siblings = childrenAt(tree, parent);
  const idx = siblings.findIndex((n) => n.name === name);
  if (idx === -1) return null;
  return siblings.splice(idx, 1)[0];
}

export function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => b[i] === s);
}

/** Is `ancestor` a strict ancestor of `candidate`? */
export function isAncestor(ancestor: string[], candidate: string[]): boolean {
  if (!ancestor.length || ancestor.length >= candidate.length) return false;
  return ancestor.every((s, i) => candidate[i] === s);
}

export type MoveResult = 'ok' | 'missing' | 'cycle' | 'duplicate' | 'nowhere';

/**
 * Move a node, with everything under it, to a new parent. An empty `newParent`
 * moves it to the top level.
 *
 * Refuses to move a node into its own descendant, which would detach the whole
 * subtree from the tree and lose it. Refuses when the destination already holds
 * a node of that name, for the reason renameNode does: merging two subtrees is a
 * different operation.
 *
 * `index` inserts at a position among the destination's children; omitted, the
 * node goes last.
 */
export function moveNode(
  tree: TaxonNode[],
  path: string[],
  newParent: string[],
  index?: number,
): MoveResult {
  if (!path.length) return 'missing';

  // Same parent with an index is a REPOSITION — what dragging a row up or down
  // its own column means. Without an index it is genuinely a move to where the
  // node already is, which is nothing.
  const sameParent = samePath(path.slice(0, -1), newParent);
  if (sameParent && typeof index !== 'number') return 'nowhere';
  if (samePath(path, newParent) || isAncestor(path, newParent)) return 'cycle';

  const node = findNode(tree, path);
  if (!node) return 'missing';
  if (newParent.length && !findNode(tree, newParent)) return 'missing';

  const destBefore = childrenAt(tree, newParent);
  const from = destBefore.findIndex((n) => n.name === node.name);
  if (!sameParent && destBefore.some((n) => n.name === node.name)) return 'duplicate';

  // The index names a gap in the list AS IT LOOKS NOW. Removing the node first
  // shifts everything after it up one, so a downward reposition lands one place
  // short unless the target is adjusted.
  let at = index;
  if (typeof at === 'number' && sameParent && from !== -1) {
    if (at > from) at -= 1;
    if (at === from) return 'nowhere';
  }

  removeNode(tree, path);

  // Resolved again after the removal: if the destination sat inside the same
  // array as the node's old position, that array has shifted underneath us.
  let dest: TaxonNode[];
  if (!newParent.length) {
    dest = tree;
  } else {
    const destNode = findNode(tree, newParent)!;
    if (!destNode.children) destNode.children = [];
    dest = destNode.children;
  }
  if (typeof at === 'number' && at >= 0 && at <= dest.length) dest.splice(at, 0, node);
  else dest.push(node);
  return 'ok';
}

/**
 * Reorder one level to match `order`.
 *
 * PARTIAL ORDERS ARE POSITIONAL. The names in `order` are rearranged among the
 * slots those names currently occupy, and every sibling not named keeps the
 * index it already has. This matters because the editor's tabs show one type's
 * roots at a time: reordering inside the Recordings tab sends only the Recording
 * roots, and the earlier behaviour — unnamed siblings fall to the end — would
 * have swept every book root to the bottom of the tree as a side effect of
 * dragging two records.
 */
export function reorderChildren(tree: TaxonNode[], parent: string[], order: string[]): boolean {
  const siblings = parent.length ? findNode(tree, parent)?.children : tree;
  if (!siblings || !siblings.length) return false;

  const rank = new Map(order.map((n, i) => [n, i]));
  // The indices held by the nodes being reordered. Everything else stays put.
  const slots: number[] = [];
  siblings.forEach((n, i) => {
    if (rank.has(n.name)) slots.push(i);
  });
  if (!slots.length) return false;

  const moving = slots
    .map((i) => siblings[i])
    .sort((a, b) => rank.get(a.name)! - rank.get(b.name)!);

  const before = siblings.map((n) => n.name).join(SEP);
  slots.forEach((slot, k) => {
    siblings[slot] = moving[k];
  });
  return siblings.map((n) => n.name).join(SEP) !== before;
}

// --- Legacy bridge -----------------------------------------------------------

/**
 * Build a tree from the flat section list and section-scoped shelves.
 *
 * Runs once, on the first read of a vocabulary that has no tree. Sections become
 * the top level in the order given, their shelves become children in the order
 * given, and nothing is invented. Everything the tree can express beyond that —
 * areas above sections, groups between a section and its shelves — is added
 * afterwards, by hand, in the editor.
 */
export function treeFromLegacy(
  sections: string[],
  shelvesBySection: Record<string, string[]>,
): TaxonNode[] {
  return sanitizeTree(
    sections.map((name) => {
      const children = (shelvesBySection[name] || []).map((child) => ({ name: child }));
      return children.length ? { name, children } : { name };
    }),
  );
}

/**
 * The two legacy views of the tree.
 *
 * `section` and `shelf` remain the fields items are filed by, so both are
 * derived from the tree's first two levels rather than stored separately.
 * A consequence worth knowing: once a section's children have children of their
 * own, the legacy shelf list shows the middle level and the leaves below it are
 * invisible to any surface still reading shelvesBySection. Those surfaces move
 * to the tree in the next pass.
 */
export function sectionsFromTree(tree: TaxonNode[]): string[] {
  return tree.map((n) => n.name);
}

export function shelvesBySectionFromTree(tree: TaxonNode[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const node of tree) out[node.name] = (node.children || []).map((c) => c.name);
  return out;
}

/** The path an item currently sits at, from its section and shelf. */
export function pathOfItem(i: Pick<Item, 'section' | 'shelf'>): string[] {
  return [i.section, i.shelf].map((s) => (s || '').trim()).filter(Boolean);
}

/**
 * Is this item filed at `path`, or anywhere beneath it?
 *
 * Only the first two levels can be answered honestly, because section and shelf
 * are the only places an item records where it sits. A path of depth three or
 * more matches nothing — not because nothing is filed there, but because nothing
 * CAN be until items carry a path of their own. Callers that use this to decide
 * whether a move is safe get the right answer for the wrong-looking reason, and
 * should say so to the operator rather than silently allowing the move.
 */
export function itemUnderPath(i: Pick<Item, 'section' | 'shelf'>, path: string[]): boolean {
  if (!path.length || path.length > 2) return false;
  if ((i.section || '').trim() !== path[0]) return false;
  return path.length === 1 || (i.shelf || '').trim() === path[1];
}
