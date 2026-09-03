'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Side = {
  id: number;
  title: string;
  author: string;
  year: string;
  publisher: string;
  isbn: string;
  thumb?: string | null;
  description?: string;
};

export type PairView = {
  basis:
    | 'isbn'
    | 'title+author'
    | 'short title+author'
    | 'title'
    | 'short title'
    | 'volumeless title';
  key: string;
  ambiguous: boolean;
  yearsDiffer: boolean;
  filled: string[];
  survivor: Side;
  loser: Side;
};

type State = 'idle' | 'busy' | 'done' | 'error';

const BASIS_LABEL: Record<PairView['basis'], string> = {
  isbn: 'Same ISBN',
  'title+author': 'Same title and author',
  'short title+author': 'Same main title and author',
  title: 'Same title',
  'short title': 'Same main title',
  'volumeless title': 'Same title ignoring volume numbers',
};

export default function DuplicateReview({ pairs }: { pairs: PairView[] }) {
  const [state, setState] = useState<Record<number, State>>({});
  const [note, setNote] = useState<Record<number, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  // ISBN matches with nothing ambiguous about them are the ones worth doing in
  // one pass. Everything else earns a look.
  const safeIsbn = useMemo(
    () => pairs.filter((p) => p.basis === 'isbn' && !p.ambiguous),
    [pairs],
  );

  async function merge(p: PairView) {
    setState((s) => ({ ...s, [p.loser.id]: 'busy' }));
    try {
      const res = await fetch('/api/items/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survivorId: p.survivor.id, loserId: p.loser.id }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) {
        setState((s) => ({ ...s, [p.loser.id]: 'error' }));
        setNote((n) => ({ ...n, [p.loser.id]: out?.error || 'Merge failed.' }));
        return false;
      }
      setState((s) => ({ ...s, [p.loser.id]: 'done' }));
      setNote((n) => ({
        ...n,
        [p.loser.id]: out?.filled?.length
          ? `Merged — copied ${out.filled.join(', ')}.`
          : 'Merged — nothing needed copying.',
      }));
      return true;
    } catch {
      setState((s) => ({ ...s, [p.loser.id]: 'error' }));
      setNote((n) => ({ ...n, [p.loser.id]: 'Merge failed.' }));
      return false;
    }
  }

  async function mergeAllIsbn() {
    if (!confirm(`Merge ${safeIsbn.length} unambiguous ISBN matches? Each deletes the older record.`))
      return;
    setBulkBusy(true);
    // Sequential on purpose: each merge is an update plus a delete, and a
    // failure halfway through should leave a legible trail rather than a race.
    for (const p of safeIsbn) {
      if (state[p.loser.id] === 'done') continue;
      const ok = await merge(p);
      if (!ok) break;
    }
    setBulkBusy(false);
  }

  if (!pairs.length) {
    return <p className="text-sm text-muted">No candidate pairs. Nothing to merge.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">
          {pairs.length} candidate {pairs.length === 1 ? 'pair' : 'pairs'} ·{' '}
          {safeIsbn.length} unambiguous ISBN {safeIsbn.length === 1 ? 'match' : 'matches'}
        </span>
        {safeIsbn.length > 0 && (
          <button
            onClick={mergeAllIsbn}
            disabled={bulkBusy}
            className="rounded-md bg-rust px-3 py-1 text-white disabled:opacity-50"
          >
            {bulkBusy ? 'Merging…' : `Merge ${safeIsbn.length} ISBN matches`}
          </button>
        )}
      </div>

      <ul className="space-y-3">
        {pairs.map((p) => {
          const st = state[p.loser.id] || 'idle';
          return (
            <li
              key={`${p.survivor.id}-${p.loser.id}`}
              className={`rounded-lg border p-3 ${
                st === 'done' ? 'border-line bg-card/50 opacity-60' : 'border-line bg-card'
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-moss/10 px-2 py-0.5 text-moss">
                  {BASIS_LABEL[p.basis]}
                </span>
                {p.ambiguous && (
                  <span className="rounded-full bg-rust/10 px-2 py-0.5 text-rust">
                    More than one record matched — check before merging
                  </span>
                )}
                {p.yearsDiffer && (
                  <span className="rounded-full bg-card px-2 py-0.5 text-muted">
                    Different years — two printings, or two books
                  </span>
                )}
                <span className="font-mono text-muted">{p.key}</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Record side={p.survivor} role="Keeps — has the images" />
                <Record side={p.loser} role="Absorbed and deleted — has the write-up" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {st === 'done' ? (
                  <span className="text-moss">{note[p.loser.id]}</span>
                ) : (
                  <>
                    <button
                      onClick={() => merge(p)}
                      disabled={st === 'busy' || bulkBusy}
                      className="rounded-md border border-rust px-3 py-1 text-rust hover:bg-rust hover:text-white disabled:opacity-50"
                    >
                      {st === 'busy' ? 'Merging…' : `Merge ${p.loser.id} into ${p.survivor.id}`}
                    </button>
                    <span className="text-xs text-muted">
                      {p.filled.length
                        ? `Copies ${p.filled.join(', ')}`
                        : 'Copies nothing — the surviving record already has every field filled'}
                    </span>
                    {st === 'error' && (
                      <span className="text-xs text-rust">{note[p.loser.id]}</span>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Record({ side, role }: { side: Side; role: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">{role}</p>
      <div className="flex items-start gap-2">
        {side.thumb ? (
          <img
            src={side.thumb}
            alt=""
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded border border-line bg-parchment object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="block h-14 w-14 shrink-0 rounded border border-dashed border-line"
          />
        )}
        <div className="min-w-0">
          <Link href={`/items/${side.id}`} className="font-serif hover:text-rust hover:underline">
            {side.title || <em className="text-muted">Untitled</em>}
          </Link>
          <p className="font-mono text-[10px] text-muted">#{String(side.id).padStart(6, '0')}</p>
          <p className="text-sm text-muted">{side.author}</p>
          <p className="text-xs text-muted">
            {[side.publisher, side.year, side.isbn].filter(Boolean).join(' · ')}
          </p>
          {side.description && (
            <p className="mt-1 text-xs leading-relaxed text-ink/70">{side.description}…</p>
          )}
        </div>
      </div>
    </div>
  );
}
