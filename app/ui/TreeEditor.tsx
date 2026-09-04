'use client';

import { useState } from 'react';
import type { TaxonNode } from '@/lib/taxonomy';

/**
 * The classification tree editor.
 *
 * Reordering is by explicit up/down rather than drag. Dragging inside a nested
 * tree needs either a library or a large amount of pointer bookkeeping, and the
 * thing being expressed here is a considered sequence rather than a rough
 * arrangement — the order in which regions or periods should stand. Two buttons
 * say that precisely, work from the keyboard, and cannot half-drop a node into
 * the wrong parent.
 *
 * Moving is a two-step: choose the node, then choose where it goes. A select per
 * row would mean building a menu of every path in the tree for every row.
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
  const [moving, setMoving] = useState<string[] | null>(null);

  const isSelfOrBelow = (path: string[]) =>
    !!moving && moving.every((s, i) => path[i] === s) && path.length >= moving.length;

  return (
    <div>
      {moving && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-rust bg-rust/5 px-3 py-2 text-sm">
          <span>
            Moving <strong>{moving[moving.length - 1]}</strong> — choose where it goes.
          </span>
          <button
            onClick={async () => {
              await call({ action: 'move', path: moving, parent: [] });
              setMoving(null);
            }}
            disabled={busy}
            className="rounded border border-line bg-card px-2 py-0.5 hover:border-rust disabled:opacity-50"
          >
            top level
          </button>
          <button onClick={() => setMoving(null)} className="text-muted hover:text-rust">
            cancel
          </button>
        </div>
      )}

      <Level
        nodes={tree}
        parent={[]}
        depth={0}
        counts={counts}
        busy={busy}
        call={call}
        moving={moving}
        setMoving={setMoving}
        isSelfOrBelow={isSelfOrBelow}
      />

      <Adder
        busy={busy}
        placeholder="add at the top level…"
        onAdd={(v) => call({ action: 'add', parent: [], value: v })}
      />

      <p className="mt-4 max-w-prose text-xs text-muted">
        Order is kept exactly as you set it, at every level — nothing here is sorted
        alphabetically. Counts appear on the first two levels only: an item records its place in
        section and shelf, so nothing can yet be filed deeper than that. Renaming, reordering and
        adding work at any depth; a move that would push filed books to a third level is refused
        until items carry a full path.
      </p>
    </div>
  );
}

function Level({
  nodes,
  parent,
  depth,
  counts,
  busy,
  call,
  moving,
  setMoving,
  isSelfOrBelow,
}: {
  nodes: TaxonNode[];
  parent: string[];
  depth: number;
  counts: Record<string, number>;
  busy: boolean;
  call: PathCall;
  moving: string[] | null;
  setMoving: (p: string[] | null) => void;
  isSelfOrBelow: (p: string[]) => boolean;
}) {
  const order = nodes.map((n) => n.name);

  async function nudge(index: number, by: number) {
    const next = [...order];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    await call({ action: 'reorder', parent, order: next });
  }

  return (
    <ul className={depth ? 'ml-4 border-l border-line pl-3' : ''}>
      {nodes.map((node, i) => (
        <NodeRow
          key={node.name}
          node={node}
          path={[...parent, node.name]}
          index={i}
          last={i === nodes.length - 1}
          depth={depth}
          counts={counts}
          busy={busy}
          call={call}
          moving={moving}
          setMoving={setMoving}
          isSelfOrBelow={isSelfOrBelow}
          nudge={nudge}
        />
      ))}
    </ul>
  );
}

function NodeRow({
  node,
  path,
  index,
  last,
  depth,
  counts,
  busy,
  call,
  moving,
  setMoving,
  isSelfOrBelow,
  nudge,
}: {
  node: TaxonNode;
  path: string[];
  index: number;
  last: boolean;
  depth: number;
  counts: Record<string, number>;
  busy: boolean;
  call: PathCall;
  moving: string[] | null;
  setMoving: (p: string[] | null) => void;
  isSelfOrBelow: (p: string[]) => boolean;
  nudge: (index: number, by: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [adding, setAdding] = useState(false);

  const key = path.join('/');
  const count = counts[key];
  const children = node.children || [];

  function saveRename() {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== node.name) call({ action: 'rename', path, newValue: v });
    else setDraft(node.name);
  }

  function del() {
    const deep = children.length
      ? ` and everything under it (${children.length} below)`
      : '';
    const items = count ? ` It will be cleared from ${count} item${count === 1 ? '' : 's'}.` : '';
    if (window.confirm(`Delete “${node.name}”${deep}?${items}`)) call({ action: 'delete', path });
  }

  const btn = 'text-xs text-muted hover:text-rust disabled:opacity-40';

  return (
    <li className="py-0.5">
      <div className="group flex items-center gap-1.5 text-sm">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveRename();
              if (e.key === 'Escape') {
                setEditing(false);
                setDraft(node.name);
              }
            }}
            onBlur={saveRename}
            className="flex-1 rounded border border-rust bg-parchment px-1.5 py-0.5"
          />
        ) : (
          <>
            <span className={`flex-1 truncate ${depth === 0 ? 'font-medium' : ''}`}>{node.name}</span>
            {count !== undefined && <span className="text-xs text-muted">{count}</span>}

            {moving && !isSelfOrBelow(path) && (
              <button
                onClick={async () => {
                  await call({ action: 'move', path: moving, parent: path });
                  setMoving(null);
                }}
                disabled={busy}
                className="rounded border border-rust px-1.5 text-xs text-rust hover:bg-rust hover:text-white disabled:opacity-40"
              >
                here
              </button>
            )}

            {!moving && (
              <span className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <button onClick={() => nudge(index, -1)} disabled={busy || index === 0} className={btn} aria-label={`move ${node.name} up`}>
                  ↑
                </button>
                <button onClick={() => nudge(index, 1)} disabled={busy || last} className={btn} aria-label={`move ${node.name} down`}>
                  ↓
                </button>
                <button onClick={() => setAdding((a) => !a)} disabled={busy} className={btn}>
                  add under
                </button>
                <button onClick={() => setMoving(path)} disabled={busy} className={btn}>
                  move
                </button>
                <button onClick={() => setEditing(true)} disabled={busy} className={btn}>
                  rename
                </button>
                <button onClick={del} disabled={busy} className={btn} aria-label={`delete ${node.name}`}>
                  ✕
                </button>
              </span>
            )}
          </>
        )}
      </div>

      {adding && (
        <div className="ml-4 border-l border-line pl-3">
          <Adder
            busy={busy}
            placeholder={`add under ${node.name}…`}
            autoFocus
            onAdd={async (v) => {
              await call({ action: 'add', parent: path, value: v });
              setAdding(false);
            }}
          />
        </div>
      )}

      {children.length > 0 && (
        <Level
          nodes={children}
          parent={path}
          depth={depth + 1}
          counts={counts}
          busy={busy}
          call={call}
          moving={moving}
          setMoving={setMoving}
          isSelfOrBelow={isSelfOrBelow}
        />
      )}
    </li>
  );
}

function Adder({
  busy,
  placeholder,
  autoFocus,
  onAdd,
}: {
  busy: boolean;
  placeholder: string;
  autoFocus?: boolean;
  onAdd: (v: string) => void;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft('');
  }
  return (
    <div className="mt-2 flex gap-1">
      <input
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        placeholder={placeholder}
        className="flex-1 rounded border border-line bg-parchment px-2 py-1 text-sm outline-none focus:border-rust"
      />
      <button onClick={add} disabled={busy} className="rounded bg-rust px-3 py-1 text-sm text-white disabled:opacity-50">
        add
      </button>
    </div>
  );
}
