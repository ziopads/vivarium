'use client';

import { useState } from 'react';
import TreeEditor from './TreeEditor';
import type { TaxonNode } from '@/lib/taxonomy';

type Vocab = {
  tree: TaxonNode[];
  sections: string[];
  genres: string[];
  types: string[];
  shelvesBySection: Record<string, string[]>;
};
type Kind = 'sections' | 'genres' | 'shelves' | 'types' | 'path';
type Counts = {
  sections: Record<string, number>;
  genres: Record<string, number>;
  types: Record<string, number>;
  shelvesBySection: Record<string, Record<string, number>>;
  /** Item counts keyed by joined path — populated for the first two levels. */
  byPath: Record<string, number>;
};

export default function VocabEditor({
  initial,
  counts,
  conditions,
}: {
  initial: Vocab;
  counts: Counts;
  conditions: string[];
}) {
  const [vocab, setVocab] = useState<Vocab>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/vocab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || 'Failed');
        return;
      }
      setVocab(data.vocab);
      if (data.affected) {
        setMsg(`${data.affected} item${data.affected === 1 ? '' : 's'} updated.`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function call(
    kind: Kind,
    action: 'add' | 'rename' | 'delete',
    value: string,
    newValue?: string,
    section?: string,
  ) {
    await post({ kind, action, value, newValue, section });
  }

  return (
    <div className="mt-6">
      {msg && <p className="mb-3 text-sm text-moss">{msg}</p>}

      <div className="space-y-6">
        <Panel title="Classification">
          <TreeEditor
            tree={vocab.tree}
            counts={counts.byPath}
            busy={busy}
            call={(body) => post({ kind: 'path', ...body })}
          />
        </Panel>

        <div className="grid gap-6 md:grid-cols-2 lg:max-w-3xl">
          <Panel title="Genres" count={vocab.genres.length}>
            <List
              values={vocab.genres}
              counts={counts.genres}
              busy={busy}
              onRename={(v, nv) => call('genres', 'rename', v, nv)}
              onDelete={(v) => call('genres', 'delete', v)}
            />
            <Adder busy={busy} placeholder="add genre…" onAdd={(v) => call('genres', 'add', v)} />
          </Panel>

          <Panel title="Types" count={vocab.types.length}>
            <p className="mb-2 text-xs text-muted">
              What an object is, in picker order. Renaming one retypes every item using it.
              Deleting is refused while anything still is that type. Frame and the artwork types
              carry extra fields, declared in the code; a type added here has none.
            </p>
            <List
              values={vocab.types}
              counts={counts.types}
              busy={busy}
              onRename={(v, nv) => call('types', 'rename', v, nv)}
              onDelete={(v) => call('types', 'delete', v)}
            />
            <Adder busy={busy} placeholder="add type…" onAdd={(v) => call('types', 'add', v)} />
          </Panel>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-line bg-card/50 p-4">
        <p className="text-sm font-medium">
          Condition <span className="text-muted">(fixed — not editable)</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {conditions.map((c) => (
            <span key={c} className="rounded bg-parchment px-2 py-0.5 text-xs text-muted">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <h2 className="font-serif text-lg">
        {title} {count !== undefined && <span className="text-xs text-muted">({count})</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function List({
  values,
  counts,
  busy,
  empty,
  onRename,
  onDelete,
}: {
  values: string[];
  counts: Record<string, number>;
  busy: boolean;
  empty?: string;
  onRename: (value: string, newValue: string) => void;
  onDelete: (value: string) => void;
}) {
  if (values.length === 0 && empty) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <ul className="space-y-1">
      {values.map((v) => (
        <Row key={v} value={v} count={counts[v] || 0} busy={busy} onRename={onRename} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function Row({
  value,
  count,
  busy,
  onRename,
  onDelete,
}: {
  value: string;
  count: number;
  busy: boolean;
  onRename: (value: string, newValue: string) => void;
  onDelete: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function saveRename() {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== value) onRename(value, v);
    else setDraft(value);
  }
  function del() {
    const warn =
      count > 0
        ? `Delete “${value}”? It will be cleared from ${count} item${count === 1 ? '' : 's'}.`
        : `Delete “${value}”?`;
    if (window.confirm(warn)) onDelete(value);
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveRename();
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(value);
            }
          }}
          onBlur={saveRename}
          className="flex-1 rounded border border-rust bg-parchment px-1.5 py-0.5"
        />
      ) : (
        <>
          <span className="flex-1 truncate">{value}</span>
          <span className="text-xs text-muted">{count}</span>
          <button onClick={() => setEditing(true)} disabled={busy} className="text-xs text-muted hover:text-rust disabled:opacity-50">
            rename
          </button>
          <button onClick={del} disabled={busy} className="text-xs text-muted hover:text-rust disabled:opacity-50" aria-label={`delete ${value}`}>
            ✕
          </button>
        </>
      )}
    </li>
  );
}

function Adder({ busy, placeholder, onAdd }: { busy: boolean; placeholder: string; onAdd: (v: string) => void }) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft('');
  }
  return (
    <div className="mt-3 flex gap-1">
      <input
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
