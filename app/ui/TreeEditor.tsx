'use client';

import { useMemo, useState, useEffect, useRef, Fragment } from 'react';
import {
  childrenAt,
  findNode,
  rootsForType,
  typesAt,
  sortAt,
  SORTS,
  type NodeSort,
  type TaxonNode,
} from '@/lib/taxonomy';

/**
 * The classification editor, as Finder-style columns.
 *
 * The first version rendered the whole tree as one indented list with every
 * control on every row. At a hundred-odd nodes that is a wall of text, and
 * choosing a destination for a move meant picking among a hundred identical
 * buttons. Columns fix both: each column shows one level, selecting a row opens
 * its children to the right, and the controls act on the single selected node
 * rather than repeating per row.
 *
 * Moving works the way it does in a file manager. Pick the node, navigate the
 * columns to where it belongs, press the one button. The destination is wherever
 * you have navigated to, so there is nothing to hunt for.
 *
 * TABS FILTER THE FIRST COLUMN ONLY. A branch declares which item types it
 * serves and everything under it inherits that, so the tag is meaningful on a
 * root; a child overriding its root's tags would put one branch in two tabs with
 * no way to say which one owns its order. Deeper columns are therefore never
 * filtered, and the pickers — which have no order to own — do prune at every
 * level. See pathOptionsForType.
 */

/** The tab showing every root, tagged or not. Not an item type. */
const ALL = '\u0000all';

export type PathResult = { ok: boolean; status: number; error?: string };
export type PathCall = (body: Record<string, unknown>) => Promise<PathResult>;

export default function TreeEditor({
  tree,
  types,
  counts,
  busy,
  call,
}: {
  tree: TaxonNode[];
  /** The managed item types, in picker order. One tab each. */
  types: string[];
  /** Item counts keyed by joined path. Only the first two levels have any. */
  counts: Record<string, number>;
  busy: boolean;
  call: PathCall;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState<string>(ALL);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  // The row being dragged. Held in React state as well as in dataTransfer,
  // because the drop targets need it during dragover to decide whether to accept
  // — and dataTransfer's contents are unreadable until the drop event fires.
  const [dragging, setDragging] = useState<string[] | null>(null);
  // A tagging the server refused because records under the node would be
  // stranded, held so it can be sent again with `force`. The message itself is
  // shown by the panel above; this only has to remember what to repeat.
  const [pendingTag, setPendingTag] = useState<{ path: string[]; types: string[] | null } | null>(
    null,
  );

  // The tree changes under us after every edit — a deleted node, or a renamed
  // one, leaves the stored selection pointing at nothing. Trimmed to the deepest
  // part that still resolves rather than reset, so deleting a shelf leaves you
  // standing in its section instead of back at the top.
  const path = useMemo(() => {
    const out: string[] = [];
    for (const seg of selected) {
      if (!findNode(tree, [...out, seg])) break;
      out.push(seg);
    }
    return out;
  }, [tree, selected]);

  // The roots this tab shows. Root-level only — see the note at the top.
  const visibleRoots = useMemo(
    () => (tab === ALL ? tree : rootsForType(tree, tab)),
    [tree, tab],
  );

  // One column per level: the roots this tab shows, then the children of each
  // selected node.
  //
  // The last column is rendered even when it is empty. A node with no children
  // yet still needs somewhere to type the first one, and stopping at the last
  // non-empty level left a leaf with no add field anywhere — selecting Asia gave
  // two columns and no way to put South Asia under it.
  const columns = useMemo(() => {
    const cols: TaxonNode[][] = [visibleRoots];
    for (let i = 0; i < path.length; i++) {
      cols.push(childrenAt(tree, path.slice(0, i + 1)));
    }
    return cols;
  }, [tree, visibleRoots, path]);

  const node = path.length ? findNode(tree, path) : null;
  // A selected ROOT's siblings are the roots this tab shows, not every root. Two
  // things depend on it. The up and down buttons send an order built from this
  // list, and reorderChildren is positional — it rearranges the named nodes among
  // the slots they already occupy and leaves everything unnamed where it is — so
  // a partial order is exactly right and a full one would sweep the hidden roots
  // to the bottom. And the disabled states then match what is on screen: the
  // first visible root cannot go up, whatever sits above it in the real tree.
  const siblings =
    path.length === 1 ? visibleRoots : path.length ? childrenAt(tree, path.slice(0, -1)) : [];
  const index = siblings.findIndex((n) => n.name === path[path.length - 1]);

  const movingIntoItself =
    !!moving && moving.every((s, i) => path[i] === s) && path.length >= moving.length;

  async function act(body: Record<string, unknown>) {
    return call(body);
  }

  /**
   * Translate a gap index in the FILTERED root column into an index in the real
   * tree.
   *
   * moveNode splices into the actual sibling array, so an index taken from a
   * filtered list means a different position — drop into the second gap of a tab
   * showing three of twenty-six roots and the node lands third in the whole tree,
   * nowhere near where it was released.
   *
   * A gap sits before the visible root at `at`, so the real position is just
   * after the visible root before it. Hidden roots in between keep their places.
   */
  function realRootIndex(at: number): number {
    if (tab === ALL) return at;
    if (!visibleRoots.length) return tree.length;
    const names = tree.map((n) => n.name);
    if (at <= 0) return names.indexOf(visibleRoots[0].name);
    const previous = visibleRoots[Math.min(at, visibleRoots.length) - 1];
    return names.indexOf(previous.name) + 1;
  }

  /** Is `p` the dragged node itself, or somewhere inside it? */
  const insideDragged = (p: string[]) =>
    !!dragging && dragging.every((s, i) => p[i] === s) && p.length >= dragging.length;

  async function drop(parent: string[], index?: number) {
    const path = dragging;
    setDragging(null);
    if (!path) return;
    // Only the root column is filtered, so only its indices need translating.
    const at =
      typeof index === 'number' && parent.length === 0 ? realRootIndex(index) : index;
    await act({ action: 'move', path, parent, index: at });
    setSelected([...parent, path[path.length - 1]]);
  }

  async function nudge(by: number) {
    const to = index + by;
    if (index < 0 || to < 0 || to >= siblings.length) return;
    const order = siblings.map((n) => n.name);
    [order[index], order[to]] = [order[to], order[index]];
    await act({ action: 'reorder', parent: path.slice(0, -1), order });
  }

  /**
   * Tag the selected node with the item types it serves, or clear the tag so it
   * serves everything again.
   *
   * A 409 means records already filed under it are of types the new tag excludes.
   * They are not moved and not unfiled — they keep their path and stop being
   * offered it, which /manage will flag — so the refusal is worth reading before
   * repeating it with `force`.
   */
  async function tag(next: string[] | null, force = false) {
    if (!node) return;
    const res = await act({ action: 'set', path, types: next, force });
    setPendingTag(!res.ok && res.status === 409 ? { path, types: next } : null);
  }

  async function setSort(next: string) {
    if (!node) return;
    await act({ action: 'set', path, sort: next || null });
  }

  async function saveRename() {
    const v = draft.trim();
    setRenaming(false);
    if (v && node && v !== node.name) {
      await act({ action: 'rename', path, newValue: v });
      setSelected([...path.slice(0, -1), v]);
    }
  }

  async function remove() {
    if (!node) return;
    const kids = node.children?.length ? ` and its ${node.children.length} entries below` : '';
    const n = counts[path.join('/')];
    const items = n ? ` It will be cleared from ${n} item${n === 1 ? '' : 's'}.` : '';
    if (!window.confirm(`Delete “${node.name}”${kids}?${items}`)) return;
    await act({ action: 'delete', path });
    setSelected(path.slice(0, -1));
  }

  const tool =
    'rounded-md border border-line bg-card px-2 py-1 text-xs hover:border-rust disabled:opacity-40';

  // What the selected node would serve and sort by if it declared nothing of its
  // own — read from its ancestors, so the controls can say "inherited" and name
  // the value rather than showing a blank.
  const inheritedTypes = node ? typesAt(tree, path.slice(0, -1)) : undefined;
  const inheritedSort: NodeSort = node ? sortAt(tree, path.slice(0, -1)) : 'title';

  return (
    <div>
      {/* Tabs. One per item type, plus All — which is not a type and is where an
          untagged root is worked on, since an untagged root serves everything and
          appears under every tab anyway. */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-line pb-2">
        {[ALL, ...types].map((t) => {
          const active = tab === t;
          const shown = t === ALL ? tree.length : rootsForType(tree, t).length;
          return (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                // The selection is trimmed against the tree, not against the tab,
                // so a root hidden by the new tab would stay selected with its
                // children still in view and no row lit up anywhere.
                setSelected([]);
                setRenaming(false);
                setMoving(null);
                setPendingTag(null);
              }}
              className={`rounded-md px-2.5 py-1 text-sm transition ${
                active ? 'bg-rust text-white' : 'text-muted hover:bg-parchment hover:text-ink'
              }`}
            >
              {t === ALL ? 'All' : t}{' '}
              <span className={active ? 'text-white/70' : 'text-muted'}>{shown}</span>
            </button>
          );
        })}
      </div>

      {/* Breadcrumb — where you are, and the way back up. */}
      <div className="mb-2 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => setSelected([])}
          className={path.length ? 'text-rust hover:underline' : 'text-muted'}
        >
          All
        </button>
        {path.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-muted">›</span>
            <button
              onClick={() => setSelected(path.slice(0, i + 1))}
              className={i === path.length - 1 ? 'font-medium' : 'text-rust hover:underline'}
            >
              {seg}
            </button>
          </span>
        ))}
        {/* A drop that has been sent and not yet answered otherwise looks the
            same as a drop that was ignored. */}
        {busy && <span className="ml-2 text-xs text-muted">saving…</span>}
      </div>

      {/* Columns */}
      <div className="flex h-[26rem] gap-px overflow-x-auto rounded-lg border border-line bg-line">
        {columns.map((nodes, depth) => (
          <Column
            key={depth}
            nodes={nodes}
            parent={path.slice(0, depth)}
            selectedName={path[depth]}
            counts={counts}
            busy={busy}
            dragging={dragging}
            insideDragged={insideDragged}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onDrop={drop}
            onSelect={(name) => {
              setRenaming(false);
              setSelected([...path.slice(0, depth), name]);
            }}
            onAdd={async (value) => {
              // A root added from a type tab is tagged as it is created. Without
              // this it would arrive untagged, which means it serves every type,
              // so it would show up under every other tab as well. Only the root
              // column needs it — everything deeper inherits.
              await act({
                action: 'add',
                parent: path.slice(0, depth),
                value,
                types: depth === 0 && tab !== ALL ? [tab] : undefined,
              });
              // Select what was just added. New entries go to the END of their
              // list, which in a column of eighteen is below the fold — so an add
              // looked like it had done nothing. Selecting it scrolls it into
              // view (see Column) and opens its own column to the right, ready
              // for whatever goes under it.
              setSelected([...path.slice(0, depth), value]);
            }}
          />
        ))}
      </div>

      {/* Controls, acting on the selection */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={saveRename}
            className="rounded border border-rust bg-parchment px-2 py-1 text-sm"
          />
        ) : moving ? (
          <>
            <span className="text-sm">
              Moving <strong>{moving[moving.length - 1]}</strong> to{' '}
              <strong>{path.length ? path.join(' › ') : 'the top level'}</strong>
            </span>
            <button
              onClick={async () => {
                await act({ action: 'move', path: moving, parent: path });
                setSelected([...path, moving[moving.length - 1]]);
                setMoving(null);
              }}
              disabled={busy || movingIntoItself}
              className="rounded-md border border-rust bg-rust px-2 py-1 text-xs text-white disabled:opacity-40"
            >
              move here
            </button>
            <button onClick={() => setMoving(null)} className="text-xs text-muted hover:text-rust">
              cancel
            </button>
            {movingIntoItself && (
              <span className="text-xs text-muted">Navigate somewhere outside it.</span>
            )}
          </>
        ) : node ? (
          <>
            <span className="text-sm font-medium">{node.name}</span>
            <button onClick={() => nudge(-1)} disabled={busy || index <= 0} className={tool}>
              ↑
            </button>
            <button
              onClick={() => nudge(1)}
              disabled={busy || index < 0 || index >= siblings.length - 1}
              className={tool}
            >
              ↓
            </button>
            <button
              onClick={() => {
                setDraft(node.name);
                setRenaming(true);
              }}
              disabled={busy}
              className={tool}
            >
              rename
            </button>
            <button onClick={() => setMoving(path)} disabled={busy} className={tool}>
              move
            </button>
            <button onClick={remove} disabled={busy} className={`${tool} hover:border-rust`}>
              delete
            </button>
          </>
        ) : (
          <span className="text-sm text-muted">Select an entry to rename, move or reorder it.</span>
        )}
      </div>

      {/* What the selected branch serves, and how its items are listed. Both
          inherit downward, so the common case is setting them on a root and
          never touching them again; a deeper node showing "inherited" is saying
          it follows whatever its nearest tagged ancestor decided. */}
      {node && !renaming && !moving && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-line bg-card px-3 py-2 text-xs">
          <span className="text-muted">Serves</span>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!node.types?.length}
              disabled={busy}
              onChange={() => tag(node.types?.length ? null : types.slice())}
            />
            <span>every type</span>
          </label>
          {types.map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                disabled={busy}
                checked={node.types?.includes(t) ?? false}
                onChange={(e) => {
                  const current = node.types ?? [];
                  const next = e.target.checked
                    ? [...current, t]
                    : current.filter((x) => x !== t);
                  // Unticking the last one clears the tag rather than storing an
                  // empty list. A branch no type could reach would be invisible
                  // in every picker and every tab, with nothing on screen to say
                  // why, so it is not a state worth being able to reach.
                  tag(next.length ? next : null);
                }}
              />
              <span>{t}</span>
            </label>
          ))}
          {!node.types?.length && inheritedTypes && (
            <span className="text-muted">(inherits {inheritedTypes.join(', ')})</span>
          )}

          <span className="ml-2 border-l border-line pl-4 text-muted">List items by</span>
          <select
            value={node.sort || ''}
            disabled={busy}
            onChange={(e) => setSort(e.target.value)}
            className="rounded border border-line bg-parchment px-1.5 py-0.5"
          >
            <option value="">inherited — {inheritedSort}</option>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {pendingTag && (
            <span className="flex items-center gap-2">
              <button
                onClick={() => tag(pendingTag.types, true)}
                disabled={busy}
                className="rounded border border-rust px-2 py-0.5 text-rust hover:bg-rust hover:text-white disabled:opacity-40"
              >
                Tag it anyway
              </button>
              <button onClick={() => setPendingTag(null)} className="text-muted hover:text-rust">
                leave it
              </button>
            </span>
          )}
        </div>
      )}

      <p className="mt-3 max-w-prose text-xs text-muted">
        The tabs filter the first column to the branches each item type is served by; All shows
        every one. An entry added while a tab is open is tagged to that type as it is created, and
        an entry with a tag of its own carries a ◆. Everything below a tagged branch inherits it,
        which is why the mark appears on roots and not on their shelves. Drag an entry onto another
        to file it inside, into the gap between two to set where it sits,
        or into a column’s empty space to put it at the end of that level — which is how you promote
        something from a deeper level to a shallower one. The buttons do the same thing and are
        there for the keyboard. Order is kept exactly as you set it, at every level; nothing here is
        sorted alphabetically, and reordering inside a tab leaves the branches it hides where they
        are. Counts include everything filed beneath an entry, so a section’s
        number covers all of its shelves. Depth is unlimited now that items carry a full path, and
        books follow their entry wherever it goes. The one refusal left is a name collision: an
        entry cannot move somewhere that already holds one of that name, since merging two branches
        means merging their books and that should be asked for on purpose.
      </p>
    </div>
  );
}

function Column({
  nodes,
  parent,
  selectedName,
  counts,
  busy,
  dragging,
  insideDragged,
  onDragStart,
  onDragEnd,
  onDrop,
  onSelect,
  onAdd,
}: {
  nodes: TaxonNode[];
  parent: string[];
  selectedName?: string;
  counts: Record<string, number>;
  busy: boolean;
  dragging: string[] | null;
  insideDragged: (p: string[]) => boolean;
  onDragStart: (p: string[]) => void;
  onDragEnd: () => void;
  onDrop: (parent: string[], index?: number) => void;
  onSelect: (name: string) => void;
  onAdd: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');
  // Which target the pointer is over: a row index to drop INTO, a gap index to
  // drop BETWEEN, or the column's own empty space, which files the dragged node
  // under whatever this column is showing the children of. Kept per column so
  // two columns never both light up.
  const [over, setOver] = useState<{ kind: 'into' | 'gap' | 'column'; at: number } | null>(null);

  // Bring the selected row into view when it changes. Adding an entry appends
  // it to the end of the list, and in a long column that is off-screen; without
  // this the add reads as a failure. `nearest` so a selection already visible
  // does not jump the column around.
  const selectedRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedName]);

  function add() {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft('');
  }

  // A gap in this column is a valid target unless the column itself sits inside
  // the dragged subtree — dropping a node into its own descendant would detach it.
  const gapsOpen = !!dragging && !insideDragged(parent);

  const gap = (at: number) => (
    <li
      className="relative h-2"
      onDragOver={(e) => {
        if (!gapsOpen) return;
        e.preventDefault();
        // Without this the column's own handler below fires next and overwrites
        // the indicator, so an exact gap would light up as a whole-column drop.
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setOver({ kind: 'gap', at });
      }}
      onDrop={(e) => {
        if (!gapsOpen) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(null);
        onDrop(parent, at);
      }}
    >
      {gapsOpen && over?.kind === 'gap' && over.at === at && (
        <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rounded bg-rust" />
      )}
    </li>
  );

  return (
    <div className="flex w-56 shrink-0 flex-col bg-card">
      {/* THE COLUMN ITSELF IS A DROP TARGET.

          Until this, the only places that accepted a drop were the rows and the
          eight-pixel gaps between them. Within one column that is enough, since
          the rows fill it. Moving a node UP a level means dragging into a column
          that is mostly empty space — The Earth has one child and twenty rows of
          nothing under it — and releasing in that space did nothing at all, with
          no indicator and no message. Dropping here files the node under whatever
          this column lists the children of, appended last.

          Rows and gaps stop propagation, so an exact hit still wins. A row that
          refuses the drop does not stop it, which is right: releasing on the
          dragged node's own row falls through to the column and appends. */}
      <ul
        className={`flex-1 overflow-y-auto py-1 ${
          gapsOpen && over?.kind === 'column' ? 'bg-rust/5 ring-1 ring-inset ring-rust/40' : ''
        }`}
        onDragLeave={() => setOver(null)}
        onDragOver={(e) => {
          if (!gapsOpen) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setOver({ kind: 'column', at: -1 });
        }}
        onDrop={(e) => {
          if (!gapsOpen) return;
          e.preventDefault();
          setOver(null);
          onDrop(parent);
        }}
      >
        {gap(0)}
        {nodes.map((n, i) => {
          const childPath = [...parent, n.name];
          const count = counts[childPath.join('/')];
          const active = n.name === selectedName;
          const isDragged = !!dragging && dragging.join('/') === childPath.join('/');
          const canDropInto = !!dragging && !insideDragged(childPath);
          const highlight = canDropInto && over?.kind === 'into' && over.at === i;

          return (
            <Fragment key={n.name}>
              {/* draggable sits on the LI, not the button inside it. A button is
                  an interactive control with drag behaviour of its own, and
                  browsers disagree about whether a draggable one starts a drag at
                  all — Firefox and Safari commonly refuse. The li is inert, so it
                  drags everywhere, and the button keeps the click. */}
              <li
                ref={active ? selectedRef : undefined}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', childPath.join('/'));
                  onDragStart(childPath);
                }}
                onDragEnd={() => {
                  setOver(null);
                  onDragEnd();
                }}
                onDragOver={(e) => {
                  if (!canDropInto) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setOver({ kind: 'into', at: i });
                }}
                onDrop={(e) => {
                  if (!canDropInto) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setOver(null);
                  onDrop(childPath);
                }}
                className={isDragged ? 'opacity-40' : ''}
              >
                <button
                  onClick={() => onSelect(n.name)}
                  className={`flex w-full cursor-grab items-center gap-1.5 px-2 py-1 text-left text-sm transition active:cursor-grabbing ${
                    highlight
                      ? 'bg-rust/20 ring-1 ring-inset ring-rust'
                      : active
                        ? 'bg-rust text-white'
                        : 'hover:bg-parchment'
                  }`}
                >
                  <span className="flex-1 truncate">{n.name}</span>
                  {/* A tagged branch is marked, so the All tab shows at a glance
                      which roots are reserved to a type and which serve
                      everything. Only the node's OWN tag is marked; inherited
                      tags are not, or every descendant of a tagged root would
                      carry the mark and it would stop meaning anything. */}
                  {n.types?.length ? (
                    <span
                      title={`serves ${n.types.join(', ')}`}
                      className={`text-[10px] ${active && !highlight ? 'text-white/70' : 'text-moss'}`}
                    >
                      ◆
                    </span>
                  ) : null}
                  {count !== undefined && (
                    <span className={`text-xs ${active && !highlight ? 'text-white/70' : 'text-muted'}`}>
                      {count}
                    </span>
                  )}
                  <span className={`text-xs ${active && !highlight ? 'text-white/70' : 'text-muted'}`}>
                    {n.children?.length ? '›' : ''}
                  </span>
                </button>
              </li>
              {gap(i + 1)}
            </Fragment>
          );
        })}
        {!nodes.length && (
          <li className="px-2 py-2 text-xs text-muted">
            Nothing here yet — add the first entry below.
          </li>
        )}
      </ul>
      <div className="border-t border-line p-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          disabled={busy}
          placeholder="add…"
          className="w-full rounded border border-line bg-parchment px-1.5 py-1 text-xs outline-none focus:border-rust"
        />
      </div>
    </div>
  );
}
