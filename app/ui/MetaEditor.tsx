'use client';

import { useState } from 'react';
import EditableText from './EditableText';

// Taxonomy editing. Rendered inside EditMode, so it has no toggle of its own and
// no save-all: the shelf saves when you leave it, and a chip saves the moment it's
// added or removed. Nothing here can be lost by navigating away.
export default function MetaEditor({
  itemId,
  shelf,
  genres,
  subjects,
  allShelves,
  allGenres,
}: {
  itemId: number;
  shelf: string;
  genres: string[];
  subjects: string[];
  allShelves: string[];
  allGenres: string[];
}) {
  const [g, setG] = useState<string[]>(genres);
  const [sub, setSub] = useState<string[]>(subjects);
  const [gNew, setGNew] = useState('');
  const [subNew, setSubNew] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

  async function persist(patch: Record<string, string[]>) {
    setState('saving');
    try {
      const res = await fetch(`/api/items/${itemId}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setState(res.ok ? 'ok' : 'err');
      if (res.ok) setTimeout(() => setState('idle'), 1600);
    } catch {
      setState('err');
    }
  }

  function addGenre(v: string) {
    const val = v.trim();
    if (!val || g.includes(val)) return;
    const next = [...g, val];
    setG(next);
    setGNew('');
    persist({ genres: next });
  }
  function removeGenre(v: string) {
    const next = g.filter((x) => x !== v);
    setG(next);
    persist({ genres: next });
  }
  function addSubject(v: string) {
    const val = v.trim();
    if (!val || sub.includes(val)) return;
    const next = [...sub, val];
    setSub(next);
    setSubNew('');
    persist({ subjects: next });
  }
  function removeSubject(v: string) {
    const next = sub.filter((x) => x !== v);
    setSub(next);
    persist({ subjects: next });
  }

  const Chips = ({
    list,
    remove,
    tone,
  }: {
    list: string[];
    remove: (v: string) => void;
    tone: string;
  }) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((v) => (
        <span key={v} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${tone}`}>
          {v}
          <button onClick={() => remove(v)} className="font-bold hover:text-ink" aria-label={`remove ${v}`}>
            ×
          </button>
        </span>
      ))}
    </div>
  );

  return (
    <div className="mt-3 rounded-lg border border-line p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-sm font-medium">Taxonomy</p>
        {state === 'saving' && <span className="text-xs text-muted">saving…</span>}
        {state === 'ok' && <span className="text-xs text-moss">✓ saved</span>}
        {state === 'err' && <span className="text-xs text-rust">! not saved</span>}
      </div>

      <div className="mb-3">
        <EditableText itemId={itemId} field="shelf" label="Shelf" initial={shelf} list="shelves" />
        <datalist id="shelves">
          {allShelves.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </div>

      <p className="mb-1 text-sm text-muted">Genres</p>
      <Chips list={g} remove={removeGenre} tone="bg-rust/10 text-rust" />
      <div className="mb-3 mt-1 flex gap-2">
        <input
          list="genres"
          value={gNew}
          onChange={(e) => setGNew(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addGenre(gNew);
            }
          }}
          placeholder="add genre…"
          className="w-48 rounded-md border border-line bg-card px-2 py-1 text-sm outline-none focus:border-rust"
        />
        <datalist id="genres">
          {allGenres.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <button onClick={() => addGenre(gNew)} className="rounded-md border border-line px-2 text-sm hover:border-rust">
          add
        </button>
      </div>

      <p className="mb-1 text-sm text-muted">Subjects</p>
      <Chips list={sub} remove={removeSubject} tone="bg-moss/10 text-moss" />
      <div className="mt-1 flex gap-2">
        <input
          value={subNew}
          onChange={(e) => setSubNew(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSubject(subNew);
            }
          }}
          placeholder="add subject…"
          className="w-48 rounded-md border border-line bg-card px-2 py-1 text-sm outline-none focus:border-rust"
        />
        <button onClick={() => addSubject(subNew)} className="rounded-md border border-line px-2 text-sm hover:border-rust">
          add
        </button>
      </div>
    </div>
  );
}
