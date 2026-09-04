'use client';

import { useMemo, useState } from 'react';
import { childrenAt, findNode, type TaxonNode } from '@/lib/taxonomy';

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
 */

export type PathCall = (body: Record<string, unknown>) => Promise<void>;

export default function TreeEditor({
  tree,
  counts,
  busy,
  call,
}: {
  tree: TaxonNode[];
  /** Item counts keyed by joined path. Only the first two levels have any. */
  counts: Record<string, number>;
  busy: boolean;
  call: PathCall;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');

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

  // One column per level: the root, then the children of each selected node.
  const columns = useMemo(() => {
    const cols: TaxonNode[][] = [tree];
    for (let i = 0; i < path.length; i++) {
      const kids = childrenAt(tree, path.slice(0, i + 1));
      if (!kids.length) break;
      cols.push(kids);
    }
    return cols;
  }, [tree, path]);

  const node = path.length ? findNode(tree, path) : null;
  const siblings = path.length ? childrenAt(tree, path.slice(0, -1)) : [];
  const index = siblings.findIndex((n) => n.name === path[path.length - 1]);

  const movingIntoItself =
    !!moving && moving.every((s, i) => path[i] === s) && path.length >= moving.length;

  async function act(body: Record<string, unknown>) {
    await call(body);
  }

  async function nudge(by: number) {
    const to = index + by;
    if (index < 0 || to < 0 || to >= siblings.length) return;
    const order = siblings.map((n) => n.name);
    [order[index], order[to]] = [order[to], order[index]];
    await act({ action: 'reorder', parent: path.slice(0, -1), order });
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

  return (
    <div>
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
            onSelect={(name) => {
              setRenaming(false);
              setSelected([...path.slice(0, depth), name]);
            }}
            onAdd={(value) => act({ action: 'add', parent: path.slice(0, depth), value })}
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

      <p className="mt-3 max-w-prose text-xs text-muted">
        Order is kept exactly as you set it, at every level — nothing here is sorted alphabetically.
        Counts appear on the first two levels only: an item records its place in section and shelf,
        so nothing can yet be filed deeper. A move that would push filed books to a third level is
        refused until items carry a full path.
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
  onSelect,
  onAdd,
}: {
  nodes: TaxonNode[];
  parent: string[];
  selectedName?: string;
  counts: Record<string, number>;
  busy: boolean;
  onSelect: (name: string) => void;
  onAdd: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft('');
  }

  return (
    <div className="flex w-56 shrink-0 flex-col bg-card">
      <ul className="flex-1 overflow-y-auto py-1">
        {nodes.map((n) => {
          const count = counts[[...parent, n.name].join('/')];
          const active = n.name === selectedName;
          return (
            <li key={n.name}>
              <button
                onClick={() => onSelect(n.name)}
                className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm ${
                  active ? 'bg-rust text-white' : 'hover:bg-parchment'
                }`}
              >
                <span className="flex-1 truncate">{n.name}</span>
                {count !== undefined && (
                  <span className={`text-xs ${active ? 'text-white/70' : 'text-muted'}`}>{count}</span>
                )}
                <span className={`text-xs ${active ? 'text-white/70' : 'text-muted'}`}>
                  {n.children?.length ? '›' : ''}
                </span>
              </button>
            </li>
          );
        })}
        {!nodes.length && <li className="px-2 py-1 text-xs text-muted">Nothing here yet.</li>}
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
