'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The item heading, editable in place for admins via the pencil. Both fields save
// when you leave them (never a save-all), so a half-typed title can't be lost.
export default function TitleEditor({
  itemId,
  title,
  author,
}: {
  itemId: number;
  title: string;
  author: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [a, setA] = useState(author);
  const [savedT, setSavedT] = useState(title);
  const [savedA, setSavedA] = useState(author);
  const [state, setState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

  async function persist(patch: Record<string, string>) {
    setState('saving');
    try {
      const res = await fetch(`/api/items/${itemId}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setState(res.ok ? 'ok' : 'err');
      if (res.ok) setTimeout(() => setState('idle'), 1600);
      return res.ok;
    } catch {
      setState('err');
      return false;
    }
  }

  async function commitTitle() {
    const v = t.trim();
    if (!v) {
      setState('err');
      return;
    }
    if (v === savedT.trim()) return;
    if (await persist({ title: v })) setSavedT(v);
  }

  async function commitAuthor() {
    const v = a.trim();
    if (v === savedA.trim()) return;
    if (await persist({ author: v })) setSavedA(v);
  }

  async function done() {
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise((r) => setTimeout(r, 250));
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mt-1 flex items-start gap-2">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl leading-tight sm:text-3xl">{title}</h1>
          {author && <p className="mt-1 text-lg text-muted">{author}</p>}
        </div>
        <button
          onClick={() => setOpen(true)}
          title="Edit title & author"
          aria-label="Edit title and author"
          className="mt-1 shrink-0 rounded p-1 text-muted transition hover:text-rust"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-lg border border-rust/40 bg-card p-3">
      <label className="block text-sm">
        <span className="mb-1 flex items-center gap-2">
          <span className="text-muted">Title</span>
          {state === 'saving' && <span className="text-xs text-muted">saving…</span>}
          {state === 'ok' && <span className="text-xs text-moss">✓ saved</span>}
          {state === 'err' && <span className="text-xs text-rust">! not saved (title can’t be empty)</span>}
        </span>
        <input
          value={t}
          autoFocus
          onChange={(e) => setT(e.target.value)}
          onBlur={commitTitle}
          className="w-full rounded border border-line bg-parchment px-2 py-1 font-serif text-lg outline-none focus:border-rust"
        />
      </label>
      <label className="mt-2 block text-sm">
        <span className="mb-1 block text-muted">Author / Maker</span>
        <input
          value={a}
          onChange={(e) => setA(e.target.value)}
          onBlur={commitAuthor}
          className="w-full rounded border border-line bg-parchment px-2 py-1 outline-none focus:border-rust"
        />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={done} className="rounded-md bg-rust px-3 py-1.5 text-sm font-medium text-white">
          Save &amp; close
        </button>
        <span className="text-xs text-muted">Saves as you leave each field.</span>
      </div>
    </div>
  );
}
