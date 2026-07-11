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
  const [busy, setBusy] = useState<'' | 'vis' | 'del'>('');
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
        onClick={del}
        disabled={busy !== ''}
        className="rounded-md border border-rust/50 px-3 py-1.5 text-rust transition hover:bg-rust hover:text-white disabled:opacity-50"
      >
        {busy === 'del' ? 'Deleting…' : 'Delete item'}
      </button>
    </div>
  );
}
