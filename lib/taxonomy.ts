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

export type TaxonNode = {
  name: string;
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
    out.push(children.length ? { name, children } : { name });
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
 */
export function moveNode(
  tree: TaxonNode[],
  path: string[],
  newParent: string[],
  index?: number,
): MoveResult {
  if (!path.length) return 'missing';
  if (samePath(path.slice(0, -1), newParent)) return 'nowhere';
  if (samePath(path, newParent) || isAncestor(path, newParent)) return 'cycle';

  const node = findNode(tree, path);
  if (!node) return 'missing';
  if (newParent.length && !findNode(tree, newParent)) return 'missing';
  if (childrenAt(tree, newParent).some((n) => n.name === node.name)) return 'duplicate';

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
  if (typeof index === 'number' && index >= 0 && index <= dest.length) dest.splice(index, 0, node);
  else dest.push(node);
  return 'ok';
}

/**
 * Reorder one level to match `order`.
 *
 * Names absent from `order` keep their relative positions at the end, so a
 * partial or stale ordering rearranges what it names and leaves the rest alone
 * instead of dropping it.
 */
export function reorderChildren(tree: TaxonNode[], parent: string[], order: string[]): boolean {
  const siblings = parent.length ? findNode(tree, parent)?.children : tree;
  if (!siblings || !siblings.length) return false;
  const rank = new Map(order.map((n, i) => [n, i]));
  const before = siblings.map((n) => n.name).join(SEP);
  siblings.sort((a, b) => {
    const ra = rank.has(a.name) ? rank.get(a.name)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.name) ? rank.get(b.name)! : Number.MAX_SAFE_INTEGER;
    return ra - rb;
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
