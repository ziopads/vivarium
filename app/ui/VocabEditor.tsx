'use client';

import { useState } from 'react';

type Vocab = { sections: string[]; genres: string[]; shelves: string[] };
type Kind = 'sections' | 'genres' | 'shelves';
type Counts = Record<Kind, Record<string, number>>;
type Call = (kind: Kind, action: 'add' | 'rename' | 'delete', value: string, newValue?: string) => void;

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

  const call: Call = async (kind, action, value, newValue) => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/vocab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, action, value, newValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || 'Failed');
        return;
      }
      setVocab(data.vocab);
      if (data.affected) {
        setMsg(
          `${action === 'rename' ? 'Renamed' : 'Cleared'} — ${data.affected} item${
            data.affected === 1 ? '' : 's'
          } updated.`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6">
      {msg && <p className="mb-3 text-sm text-moss">{msg}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <VocabColumn title="Sections" kind="sections" values={vocab.sections} counts={counts.sections} call={call} busy={busy} />
        <VocabColumn title="Genres" kind="genres" values={vocab.genres} counts={counts.genres} call={call} busy={busy} />
        <VocabColumn title="Shelves" kind="shelves" values={vocab.shelves} counts={counts.shelves} call={call} busy={busy} />
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

function VocabColumn({
  title,
  kind,
  values,
  counts,
  call,
  busy,
}: {
  title: string;
  kind: Kind;
  values: string[];
  counts: Record<string, number>;
  call: Call;
  busy: boolean;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (v) call(kind, 'add', v);
    setDraft('');
  }
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <h2 className="font-serif text-lg">
        {title} <span className="text-xs text-muted">({values.length})</span>
      </h2>
      <ul className="mt-3 space-y-1">
        {values.map((v) => (
          <VocabRow key={v} kind={kind} value={v} count={counts[v] || 0} call={call} busy={busy} />
        ))}
      </ul>
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
          placeholder={`add ${title.toLowerCase().replace(/s$/, '')}…`}
          className="flex-1 rounded border border-line bg-parchment px-2 py-1 text-sm outline-none focus:border-rust"
        />
        <button onClick={add} disabled={busy} className="rounded bg-rust px-3 py-1 text-sm text-white disabled:opacity-50">
          add
        </button>
      </div>
    </div>
  );
}

function VocabRow({
  kind,
  value,
  count,
  call,
  busy,
}: {
  kind: Kind;
  value: string;
  count: number;
  call: Call;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function saveRename() {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== value) call(kind, 'rename', value, v);
    else setDraft(value);
  }
  function del() {
    const warn =
      count > 0
        ? `Delete “${value}”? It will be cleared from ${count} item${count === 1 ? '' : 's'}.`
        : `Delete “${value}”?`;
    if (window.confirm(warn)) call(kind, 'delete', value);
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
