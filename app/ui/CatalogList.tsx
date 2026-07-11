'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Item } from '@/lib/types';
import { CONDITIONS } from '@/lib/sections';

type Row = Item;
type Patch = Partial<
  Pick<Item, 'section' | 'shelf' | 'genres' | 'subjects' | 'location' | 'notes' | 'condition' | 'conditionNotes'>
>;

export default function CatalogList({
  items,
  sections,
  shelves,
  genres,
}: {
  items: Item[];
  sections: string[];
  shelves: string[];
  genres: string[];
}) {
  const [rows, setRows] = useState<Row[]>(items);
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => setRows(items), [items]);

  async function save(id: number, patch: Patch) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      await fetch(`/api/items/${id}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setSaved(id);
      setTimeout(() => setSaved((s) => (s === id ? null : s)), 1200);
    } catch {
      /* keep optimistic value */
    }
  }

  const toList = (s: string) =>
    Array.from(new Set(s.split(',').map((x) => x.trim()).filter(Boolean)));

  const cell =
    'rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-line focus:border-rust focus:bg-parchment';
  // Column headers stay pinned to the top; ID + Title stay pinned to the left.
  const th = 'sticky top-0 z-20 bg-card px-2 py-2 font-medium';
  const thId = 'sticky top-0 left-0 z-30 w-[64px] bg-card px-2 py-2 font-medium';
  const thTitle = 'sticky top-0 left-[64px] z-30 w-[220px] border-r border-line bg-card px-2 py-2 font-medium';
  const tdId =
    'sticky left-0 z-10 w-[64px] whitespace-nowrap bg-parchment px-2 py-1.5 font-mono text-[11px] text-muted';
  const tdTitle = 'sticky left-[64px] z-10 w-[220px] border-r border-line bg-parchment px-2 py-1.5';

  return (
    <div>
      <div className="max-h-[calc(100vh-8rem)] overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[1650px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className={thId}>ID</th>
              <th className={thTitle}>Title</th>
              <th className={th}>Author</th>
              <th className={th}>Yr</th>
              <th className={th}>Section</th>
              <th className={th}>Shelf</th>
              <th className={th}>Genres</th>
              <th className={th}>Subjects</th>
              <th className={th}>Location</th>
              <th className={th}>Notes</th>
              <th className={th}>Condition</th>
              <th className={th}>Cond. notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 align-top">
                <td className={tdId}>
                  {String(r.id).padStart(6, '0')}
                  {saved === r.id && <span className="ml-1 text-moss">✓</span>}
                </td>
                <td className={tdTitle}>
                  <Link href={`/items/${r.id}`} className="font-serif hover:text-rust hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-muted">{r.author}</td>
                <td className="px-2 py-1.5 text-muted">{r.year}</td>
                <td className="px-2 py-1.5">
                  <input
                    list="sectionopts"
                    defaultValue={r.section || ''}
                    onBlur={(e) => e.target.value !== (r.section || '') && save(r.id, { section: e.target.value.trim() })}
                    className={`w-32 ${cell}`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    list="shelfopts"
                    defaultValue={r.shelf}
                    onBlur={(e) => e.target.value !== r.shelf && save(r.id, { shelf: e.target.value.trim() })}
                    className={`w-28 ${cell}`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    list="genreopts"
                    defaultValue={r.genres.join(', ')}
                    onBlur={(e) => {
                      const v = toList(e.target.value);
                      if (v.join('|') !== r.genres.join('|')) save(r.id, { genres: v });
                    }}
                    className={`w-52 ${cell}`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    defaultValue={r.subjects.join(', ')}
                    onBlur={(e) => {
                      const v = toList(e.target.value);
                      if (v.join('|') !== r.subjects.join('|')) save(r.id, { subjects: v });
                    }}
                    className={`w-64 ${cell}`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    list="locopts"
                    defaultValue={r.location || ''}
                    onBlur={(e) => e.target.value !== (r.location || '') && save(r.id, { location: e.target.value.trim() })}
                    className={`w-28 ${cell}`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    defaultValue={r.notes || ''}
                    onBlur={(e) => e.target.value !== (r.notes || '') && save(r.id, { notes: e.target.value })}
                    className={`w-72 ${cell}`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    list="condopts"
                    defaultValue={r.condition || ''}
                    onBlur={(e) => e.target.value !== (r.condition || '') && save(r.id, { condition: e.target.value.trim() })}
                    className={`w-28 ${cell}`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    defaultValue={r.conditionNotes || ''}
                    onBlur={(e) => e.target.value !== (r.conditionNotes || '') && save(r.id, { conditionNotes: e.target.value })}
                    className={`w-64 ${cell}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <datalist id="shelfopts">{shelves.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="sectionopts">{sections.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="genreopts">{genres.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="condopts">{CONDITIONS.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="locopts">
        {Array.from(new Set(rows.map((r) => r.location).filter(Boolean))).map((x) => (
          <option key={x as string} value={x as string} />
        ))}
      </datalist>
      <p className="px-2 py-2 text-xs text-muted">
        Edit inline — changes save when you leave a cell. Genres and subjects are comma-separated;
        section, shelf and genre suggestions come from the managed vocabulary.
      </p>
    </div>
  );
}
