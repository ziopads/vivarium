'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Wish } from '@/lib/wishlist';
import type { PathOption } from '@/lib/taxonomy';
import PathSelect from './PathSelect';

/**
 * A wish carries a type and a filing path now, the same two facts a catalogue
 * record carries, because a wish becomes one. The section dropdown this replaced
 * offered the tree's top level only, so a wish could never be filed deeper than
 * a section — and it had no type at all, which meant a wished-for recording came
 * back into the library as a book.
 *
 * Changing the type re-scopes the filing picker, which is why every type's
 * options are held here rather than only the current one's. A path the new type
 * is not served by is left in place rather than cleared: it is still what the
 * wish says about itself, PathSelect renders it as an unknown value, and
 * silently unfiling something on a mis-click would be worse than showing it.
 */
export default function WishEditor({
  w,
  types,
  pathsByType,
}: {
  w: Wish;
  types: string[];
  pathsByType: Record<string, PathOption[]>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(w.title);
  const [author, setAuthor] = useState(w.author);
  const [itemType, setItemType] = useState(w.itemType || 'Book');
  const [classification, setClassification] = useState(w.classification || '');
  const [note, setNote] = useState(w.note || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const paths = pathsByType[itemType] ?? [];

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/wishlist/${w.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, itemType, classification, note }),
      });
      if (res.ok) {
        setMsg('Saved');
        router.refresh();
      } else {
        const out = await res.json().catch(() => null);
        setMsg(out?.error ? `Not saved — ${out.error}` : 'Not saved');
      }
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!window.confirm('Remove this from the wishlist?')) return;
    const res = await fetch(`/api/wishlist/${w.id}`, { method: 'DELETE' });
    if (res.ok) router.push('/wishlist');
  }

  const field = 'rounded border border-line bg-card px-2 py-1.5 text-sm';

  return (
    <div className="mt-8 rounded-lg border border-line p-4">
      <p className="mb-2 text-sm font-medium">Edit</p>
      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className={field}
        />
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Author"
          className={field}
        />
        <label className="text-sm">
          <span className="mb-1 block text-muted">Type</span>
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            className={`w-full ${field}`}
          >
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Filed under</span>
          <PathSelect
            value={classification}
            paths={paths}
            onChange={setClassification}
            className={`w-full ${field}`}
          />
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note"
          rows={2}
          className={field}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-md bg-rust px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={del}
          className="rounded-md border border-rust/50 px-3 py-1.5 text-sm text-rust hover:bg-rust hover:text-white"
        >
          Remove
        </button>
        {msg && (
          <span className={msg.startsWith('Not saved') ? 'text-sm text-rust' : 'text-sm text-moss'}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
