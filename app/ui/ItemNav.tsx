'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Node = { i: number; t: string };

// Reads the ordered sequence Catalog wrote to sessionStorage while browsing, so
// prev/next walk the current filtered + sorted set — like moving along a shelf.
export default function ItemNav({ itemId }: { itemId: number }) {
  const [nav, setNav] = useState<{ prev?: Node; next?: Node; pos?: string } | null>(null);

  useEffect(() => {
    try {
      const seq: Node[] = JSON.parse(sessionStorage.getItem('vivarium.browse.seq') || '[]');
      const idx = seq.findIndex((s) => s.i === itemId);
      if (idx === -1) return setNav(null);
      setNav({ prev: seq[idx - 1], next: seq[idx + 1], pos: `${idx + 1} of ${seq.length}` });
    } catch {
      setNav(null);
    }
  }, [itemId]);

  if (!nav || (!nav.prev && !nav.next)) return null;
  return (
    <nav className="mt-3 flex items-center justify-between gap-3 text-sm">
      {nav.prev ? (
        <Link href={`/items/${nav.prev.i}`} className="flex min-w-0 items-center gap-1 text-rust hover:underline">
          <span aria-hidden>←</span>
          <span className="truncate">{nav.prev.t}</span>
        </Link>
      ) : (
        <span />
      )}
      <span className="shrink-0 text-xs text-muted">{nav.pos}</span>
      {nav.next ? (
        <Link href={`/items/${nav.next.i}`} className="flex min-w-0 items-center justify-end gap-1 text-rust hover:underline">
          <span className="truncate">{nav.next.t}</span>
          <span aria-hidden>→</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
