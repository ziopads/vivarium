'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  VISIBILITY,
  VISIBILITY_LABEL,
  VISIBILITY_MARK,
  normalizeVisibility,
  type Visibility,
} from '@/lib/visibility';

export default function ItemActions({
  itemId,
  visibility,
}: {
  itemId: number;
  visibility?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'' | 'vis' | 'del' | 'wish'>('');
  const current = normalizeVisibility(visibility);

  // Goes through the meta route, which patches the one column. The old
  // /api/items/:id/visibility endpoint read the whole catalogue and wrote every
  // record back to change one field, and could only toggle between two values —
  // it would have flattened the middle tier on every click.
  async function setVisibility(v: Visibility) {
    if (v === current) return;
    setBusy('vis');
    try {
      await fetch(`/api/items/${itemId}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: v }),
      });
      router.refresh();
    } finally {
      setBusy('');
    }
  }

  async function del() {
    if (!window.confirm('Delete this item and its images? This cannot be undone.')) return;
    setBusy('del');
    try {
      const res = await fetch(`/api/items/${itemId}/delete`, { method: 'POST' });
      if (res.ok) router.push('/');
      else setBusy('');
    } catch {
      setBusy('');
    }
  }

  async function toWishlist() {
    if (
      !window.confirm(
        'Move this book to the wishlist? The record leaves the catalogue but keeps its ' +
          'write-up and photographs, and can be moved back if you get another copy.',
      )
    )
      return;
    setBusy('wish');
    try {
      const res = await fetch('/api/wishlist/from-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.wishId) router.push(`/wishlist/${out.wishId}`);
      else setBusy('');
    } catch {
      setBusy('');
    }
  }

  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
      <span className="text-muted">Manage:</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted">Visibility:</span>
        {VISIBILITY.map((v) => (
          <button
            key={v}
            onClick={() => setVisibility(v)}
            disabled={busy !== ''}
            aria-pressed={v === current}
            title={
              v === 'public'
                ? 'Anyone through the site gate'
                : v === 'link'
                  ? 'Signed-in viewers'
                  : 'Admins only'
            }
            className={`rounded-md border px-3 py-1.5 transition disabled:opacity-50 ${
              v === current
                ? 'border-moss bg-moss/10 text-moss'
                : 'border-line hover:border-rust'
            }`}
          >
            {VISIBILITY_MARK[v]} {VISIBILITY_LABEL[v]}
          </button>
        ))}
      </span>
      <button
        onClick={toWishlist}
        disabled={busy !== ''}
        className="rounded-md border border-line px-3 py-1.5 transition hover:border-rust disabled:opacity-50"
        title="No longer own it — keep the write-up and look for another copy"
      >
        {busy === 'wish' ? 'Moving…' : 'Move to wishlist'}
      </button>
      <button
        onClick={del}
        disabled={busy !== ''}
        className="rounded-md border border-rust/50 px-3 py-1.5 text-rust transition hover:bg-rust hover:text-white disabled:opacity-50"
      >
        {busy === 'del' ? 'Deleting…' : 'Delete item'}
      </button>
    </div>
  );
}
