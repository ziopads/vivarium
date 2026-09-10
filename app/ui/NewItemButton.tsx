'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { typeOptions } from '@/lib/itemTypes';

// `types` is vocab.types, read on the server and passed down. Previously this
// imported the TYPE_OPTIONS constant directly, so a type added in /admin/vocab
// never reached the one picker where a record's type is first set.
export default function NewItemButton({ types }: { types?: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('Book');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);

  const options = typeOptions(types, type);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/items/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: type, title: title.trim(), author: author.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.id) router.push(`/items/${data.id}`);
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md bg-rust px-4 py-2 text-sm text-white">
        + New item
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-4">
      <label className="text-sm">
        <span className="mb-1 block text-muted">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-line bg-parchment px-2 py-1"
        >
          {options.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Title</span>
        <input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          className="w-64 rounded border border-line bg-parchment px-2 py-1"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Author / Maker</span>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          className="w-56 rounded border border-line bg-parchment px-2 py-1"
        />
      </label>
      <button
        onClick={create}
        disabled={busy || !title.trim()}
        className="rounded-md bg-rust px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create & edit'}
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-muted hover:text-rust">
        Cancel
      </button>
    </div>
  );
}
