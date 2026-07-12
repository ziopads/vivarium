'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Wish } from '@/lib/wishlist';
import { r2Url } from '@/lib/img';

const name = (email: string) => (email ? email.split('@')[0] : '—');

export default function WishlistView({
  wishes: initial,
  viewerEmail,
  isAdmin,
  sections,
}: {
  wishes: Wish[];
  viewerEmail: string | null;
  isAdmin: boolean;
  sections: string[];
}) {
  const [wishes, setWishes] = useState(initial);
  const [who, setWho] = useState<'all' | 'mine' | string>('all');
  const [editing, setEditing] = useState<number | null>(null);

  const contributors = useMemo(
    () => Array.from(new Set(wishes.map((w) => w.addedBy).filter(Boolean))).sort(),
    [wishes],
  );

  const filtered = wishes.filter((w) => {
    if (who === 'all') return true;
    if (who === 'mine') return w.addedBy === viewerEmail;
    return w.addedBy === who;
  });

  const bySection = new Map<string, Wish[]>();
  for (const w of filtered) {
    const s = w.section || 'Unsorted';
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s)!.push(w);
  }
  const secs = Array.from(bySection.keys()).sort();

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${
      active ? 'border-rust bg-rust text-white' : 'border-line bg-card hover:border-rust'
    }`;

  async function del(id: number) {
    if (!window.confirm('Remove this from the wishlist?')) return;
    const res = await fetch(`/api/wishlist/${id}`, { method: 'DELETE' });
    if (res.ok) setWishes((ws) => ws.filter((w) => w.id !== id));
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button onClick={() => setWho('all')} className={chip(who === 'all')}>Everyone</button>
        {viewerEmail && (
          <button onClick={() => setWho('mine')} className={chip(who === 'mine')}>Mine</button>
        )}
        {contributors
          .filter((c) => c !== viewerEmail)
          .map((c) => (
            <button key={c} onClick={() => setWho(c)} className={chip(who === c)}>{name(c)}</button>
          ))}
        <Link href="/wishlist/add" className="ml-auto rounded-md bg-rust px-4 py-1.5 text-sm text-white">
          + Add
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Nothing here yet — tap “+ Add” to snap a book.</p>
      ) : (
        <div className="space-y-10">
          {secs.map((s) => (
            <section key={s}>
              <h2 className="mb-3 border-b border-line pb-1 font-serif text-xl text-rust">{s}</h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {bySection.get(s)!.map((w) => (
                  <li key={w.id} className="flex gap-3 rounded-lg border border-line bg-card p-3">
                    {w.image && (
                      <img src={r2Url(w.image)} alt="" className="h-24 w-16 shrink-0 rounded bg-parchment object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      {editing === w.id ? (
                        <EditRow
                          w={w}
                          sections={sections}
                          onDone={(nw) => {
                            setWishes((ws) => ws.map((x) => (x.id === w.id ? nw : x)));
                            setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <>
                          <p className="font-serif leading-snug">
                            {w.title || <span className="text-muted">(untitled — tap edit)</span>}
                          </p>
                          {w.author && <p className="text-sm text-muted">{w.author}</p>}
                          {w.note && <p className="mt-1 text-xs text-muted">{w.note}</p>}
                          <p className="mt-1 text-[11px] text-muted">added by {name(w.addedBy)}</p>
                          {isAdmin && (
                            <div className="mt-1 flex gap-3 text-xs">
                              <button onClick={() => setEditing(w.id)} className="text-muted hover:text-rust">edit</button>
                              <button onClick={() => del(w.id)} className="text-muted hover:text-rust">remove</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EditRow({
  w,
  sections,
  onDone,
  onCancel,
}: {
  w: Wish;
  sections: string[];
  onDone: (w: Wish) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(w.title);
  const [author, setAuthor] = useState(w.author);
  const [section, setSection] = useState(w.section);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/wishlist/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, author, section }),
    });
    if (res.ok) {
      const d = await res.json();
      onDone(d.wish);
    } else {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded border border-line bg-parchment px-2 py-1 text-sm" />
      <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" className="rounded border border-line bg-parchment px-2 py-1 text-sm" />
      <select value={section} onChange={(e) => setSection(e.target.value)} className="rounded border border-line bg-parchment px-2 py-1 text-sm">
        <option value="">— section —</option>
        {sections.map((s) => (<option key={s}>{s}</option>))}
      </select>
      <div className="mt-1 flex gap-2 text-sm">
        <button onClick={save} disabled={busy} className="rounded bg-rust px-3 py-1 text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-muted hover:text-rust">Cancel</button>
      </div>
    </div>
  );
}
