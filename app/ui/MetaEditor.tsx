'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState(shelf);
  const [g, setG] = useState<string[]>(genres);
  const [sub, setSub] = useState<string[]>(subjects);
  const [gNew, setGNew] = useState('');
  const [subNew, setSubNew] = useState('');

  const add = (list: string[], set: (v: string[]) => void, val: string) => {
    const v = val.trim();
    if (v && !list.includes(v)) set([...list, v]);
  };
  const remove = (list: string[], set: (v: string[]) => void, val: string) =>
    set(list.filter((x) => x !== val));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${itemId}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shelf: s, genres: g, subjects: sub }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-5">
        <div className="mb-1 flex items-center gap-3">
          <p className="text-sm text-muted">Genres</p>
          <button onClick={() => setEditing(true)} className="text-xs text-rust hover:underline">
            edit taxonomy
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {genres.map((v) => (
            <span key={v} className="rounded bg-rust/10 px-2 py-0.5 text-xs text-rust">{v}</span>
          ))}
        </div>
        {subjects.length > 0 && (
          <>
            <p className="mb-1 mt-4 text-sm text-muted">Subjects</p>
            <div className="flex flex-wrap gap-1.5">
              {subjects.map((v) => (
                <span key={v} className="rounded bg-moss/10 px-2 py-0.5 text-xs text-moss">{v}</span>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const Chips = ({
    list, set, tone,
  }: { list: string[]; set: (v: string[]) => void; tone: string }) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((v) => (
        <span key={v} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${tone}`}>
          {v}
          <button onClick={() => remove(list, set, v)} className="font-bold hover:text-ink" aria-label={`remove ${v}`}>×</button>
        </span>
      ))}
    </div>
  );

  return (
    <div className="mt-5 rounded-lg border border-rust/40 bg-card p-4">
      <p className="mb-3 text-sm font-medium">Edit taxonomy</p>

      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-muted">Shelf</span>
        <input
          list="shelves"
          value={s}
          onChange={(e) => setS(e.target.value)}
          className="w-full rounded-md border border-line bg-parchment px-2 py-1.5 outline-none focus:border-rust"
        />
        <datalist id="shelves">{allShelves.map((x) => <option key={x} value={x} />)}</datalist>
      </label>

      <p className="mb-1 text-sm text-muted">Genres</p>
      <Chips list={g} set={setG} tone="bg-rust/10 text-rust" />
      <div className="mb-3 mt-1 flex gap-2">
        <input
          list="genres" value={gNew} onChange={(e) => setGNew(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(g, setG, gNew); setGNew(''); } }}
          placeholder="add genre…"
          className="w-48 rounded-md border border-line bg-parchment px-2 py-1 text-sm outline-none focus:border-rust"
        />
        <datalist id="genres">{allGenres.map((x) => <option key={x} value={x} />)}</datalist>
        <button onClick={() => { add(g, setG, gNew); setGNew(''); }} className="rounded-md border border-line px-2 text-sm hover:border-rust">add</button>
      </div>

      <p className="mb-1 text-sm text-muted">Subjects</p>
      <Chips list={sub} set={setSub} tone="bg-moss/10 text-moss" />
      <div className="mb-4 mt-1 flex gap-2">
        <input
          value={subNew} onChange={(e) => setSubNew(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(sub, setSub, subNew); setSubNew(''); } }}
          placeholder="add subject…"
          className="w-48 rounded-md border border-line bg-parchment px-2 py-1 text-sm outline-none focus:border-rust"
        />
        <button onClick={() => { add(sub, setSub, subNew); setSubNew(''); }} className="rounded-md border border-line px-2 text-sm hover:border-rust">add</button>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded-md bg-rust px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-rust">Cancel</button>
      </div>
    </div>
  );
}
