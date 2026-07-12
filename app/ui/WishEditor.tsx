'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Wish } from '@/lib/wishlist';

export default function WishEditor({ w, sections }: { w: Wish; sections: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(w.title);
  const [author, setAuthor] = useState(w.author);
  const [section, setSection] = useState(w.section);
  const [note, setNote] = useState(w.note || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/wishlist/${w.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, section, note }),
      });
      if (res.ok) {
        setMsg('Saved');
        router.refresh();
      } else {
        setMsg('Not saved');
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

  return (
    <div className="mt-8 rounded-lg border border-line p-4">
      <p className="mb-2 text-sm font-medium">Edit</p>
      <div className="flex flex-col gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded border border-line bg-card px-2 py-1.5 text-sm" />
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" className="rounded border border-line bg-card px-2 py-1.5 text-sm" />
        <select value={section} onChange={(e) => setSection(e.target.value)} className="rounded border border-line bg-card px-2 py-1.5 text-sm">
          <option value="">— section —</option>
          {sections.map((s) => (<option key={s}>{s}</option>))}
        </select>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" rows={2} className="rounded border border-line bg-card px-2 py-1.5 text-sm" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-md bg-rust px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={del} className="rounded-md border border-rust/50 px-3 py-1.5 text-sm text-rust hover:bg-rust hover:text-white">
          Remove
        </button>
        {msg && <span className="text-sm text-moss">{msg}</span>}
      </div>
    </div>
  );
}
