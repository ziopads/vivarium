'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Wish } from '@/lib/wishlist';
import { r2Url } from '@/lib/img';

const name = (email: string) => (email ? email.split('@')[0] : '—');

export default function WishlistView({
  wishes,
  viewerEmail,
}: {
  wishes: Wish[];
  viewerEmail: string | null;
}) {
  const [who, setWho] = useState<'all' | 'mine' | string>('all');
  const [filterSection, setFilterSection] = useState('all');

  const contributors = useMemo(
    () => Array.from(new Set(wishes.map((w) => w.addedBy).filter(Boolean))).sort(),
    [wishes],
  );
  const sectionsPresent = useMemo(
    () => Array.from(new Set(wishes.map((w) => w.section || 'Unsorted'))).sort(),
    [wishes],
  );

  const filtered = wishes.filter((w) => {
    if (who === 'mine' ? w.addedBy !== viewerEmail : who !== 'all' && w.addedBy !== who) return false;
    if (filterSection !== 'all' && (w.section || 'Unsorted') !== filterSection) return false;
    return true;
  });

  const bySection = new Map<string, Wish[]>();
  for (const w of filtered) {
    const s = w.section || 'Unsorted';
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s)!.push(w);
  }
  const secs = Array.from(bySection.keys()).sort();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-sm text-muted">
          <span className="mb-1 block">Who</span>
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
          >
            <option value="all">Everyone</option>
            {viewerEmail && <option value="mine">Mine</option>}
            {contributors
              .filter((c) => c !== viewerEmail)
              .map((c) => (
                <option key={c} value={c}>{name(c)}</option>
              ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          <span className="mb-1 block">Section</span>
          <select
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
            className="rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink"
          >
            <option value="all">All</option>
            {sectionsPresent.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <Link href="/wishlist/add" className="ml-auto rounded-md bg-rust px-4 py-2 text-sm text-white">
          + Add
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Nothing here yet — tap “+ Add” to snap a book.</p>
      ) : (
        <div className="space-y-8">
          {secs.map((s) => (
            <section key={s}>
              <h2 className="mb-1 border-b border-line pb-1 font-serif text-xl text-rust">{s}</h2>
              <ul className="divide-y divide-line">
                {bySection.get(s)!.map((w) => (
                  <li key={w.id}>
                    <Link
                      href={`/wishlist/${w.id}`}
                      className="-mx-2 flex items-center gap-3 rounded px-2 py-3 hover:bg-card"
                    >
                      {w.image ? (
                        <img src={r2Url(w.image)} alt="" className="h-16 w-12 shrink-0 rounded bg-parchment object-cover" />
                      ) : (
                        <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-parchment text-muted">–</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-serif">
                          {w.title || <span className="text-muted">(untitled)</span>}
                        </p>
                        {w.author && <p className="truncate text-sm text-muted">{w.author}</p>}
                        <p className="text-[11px] text-muted">added by {name(w.addedBy)}</p>
                      </div>
                      <span className="text-muted" aria-hidden>›</span>
                    </Link>
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
