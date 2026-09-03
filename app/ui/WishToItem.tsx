'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The return trip: a wished-for book arrives and becomes a catalogue record,
 * carrying back everything the wish held — including the write-up, which is
 * usually the reason it was worth keeping the wish rather than a bare title.
 */
export default function WishToItem({ wishId }: { wishId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function move() {
    if (
      !window.confirm(
        'Move this into the library? It becomes a catalogue record with its write-up and ' +
          'photographs, and leaves the wishlist.',
      )
    )
      return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/wishlist/${wishId}/to-item`, { method: 'POST' });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.itemId) {
        router.push(`/items/${out.itemId}`);
        return;
      }
      setErr(out?.error || 'Could not move it.');
    } catch {
      setErr('Could not move it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
      <span className="text-muted">Got it?</span>
      <button
        onClick={move}
        disabled={busy}
        className="rounded-md bg-moss px-3 py-1.5 text-white disabled:opacity-50"
      >
        {busy ? 'Moving…' : 'Move into the library'}
      </button>
      {err && <span className="text-rust">{err}</span>}
    </div>
  );
}
