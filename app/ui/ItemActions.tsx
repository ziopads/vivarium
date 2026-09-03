'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ItemActions({
  itemId,
  visibility,
}: {
  itemId: number;
  visibility?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'' | 'vis' | 'del' | 'wish'>('');
  const isPrivate = visibility === 'restricted';

  async function toggleVisibility() {
    setBusy('vis');
    try {
      await fetch(`/api/items/${itemId}/visibility`, { method: 'POST' });
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
      <button
        onClick={toggleVisibility}
        disabled={busy !== ''}
        className={`rounded-md border px-3 py-1.5 transition disabled:opacity-50 ${
          isPrivate ? 'border-moss bg-moss/10 text-moss' : 'border-line hover:border-rust'
        }`}
      >
        {busy === 'vis' ? '…' : isPrivate ? '🔒 Private — make public' : 'Make private'}
      </button>
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
