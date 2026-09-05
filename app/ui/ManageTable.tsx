'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { isUnderPath, type PathOption } from '@/lib/taxonomy';
import PathSelect from './PathSelect';

type Row = {
  id: number;
  title: string;
  /** What the object IS. Drives the type-specific fields on the item page. */
  itemType: string;
  /** Thumb-tier URL, resolved server-side. Empty when the record has no image. */
  thumb: string;
  /** Full path into the classification tree. Empty means unfiled. */
  classification: string;
  genres: string[];
  subjects: string[];
};

/**
 * Row thumbnail.
 *
 * `loading="lazy"` is not decoration here. This table renders every record in
 * the catalogue at once with no virtualization, so without it the page would
 * open seventeen hundred image requests on load. Lazy loading holds that to
 * what is actually scrolled past.
 *
 * The box keeps its dimensions whether or not an image loads, so rows do not
 * change height as thumbnails arrive and the list does not jump under the
 * cursor while you are working down it.
 *
 * Hover enlarges via a sibling absolutely-positioned copy rather than by
 * scaling the cell, which would reflow the row.
 */
function Thumb({ src, title }: { src: string; title: string }) {
  if (!src) {
    return (
      <div
        className="flex h-16 w-12 items-center justify-center rounded border border-dashed border-line text-[10px] text-muted"
        title="No photograph"
      >
        —
      </div>
    );
  }
  return (
    <div className="group/th relative h-16 w-12">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-16 w-12 rounded border border-line bg-parchment object-cover"
      />
      <img
        src={src}
        alt={title}
        loading="lazy"
        decoding="async"
        className="pointer-events-none absolute left-0 top-0 z-30 hidden max-w-none rounded border border-line bg-parchment object-contain shadow-lg group-hover/th:block"
        style={{ width: '13rem', height: 'auto' }}
      />
    </div>
  );
}

// Sentinels for the bulk bar. Splitting "leave alone" from "clear" matters: the old
// single — none — default meant one stray click on Apply with everything selected
// would wipe the section off the whole catalogue.
const NO_CHANGE = '__nochange__';
const CLEAR = '__clear__';

export default function ManageTable({
  rows: initial,
  paths,
  genreSuggest,
  subjectSuggest,
  types,
}: {
  rows: Row[];
  paths: PathOption[];
  genreSuggest: string[];
  subjectSuggest: string[];
  types: string[];
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [q, setQ] = useState('');
  const [filterPath, setFilterPath] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkPath, setBulkPath] = useState(NO_CHANGE);
  const [bulkType, setBulkType] = useState(NO_CHANGE);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [busyBulk, setBusyBulk] = useState(false);

  const unfiled = rows.filter((r) => !r.classification).length;
  const filed = rows.length - unfiled;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterPath === 'Unfiled') {
        if (r.classification) return false;
      } else if (filterPath === 'Filed') {
        if (!r.classification) return false;
      } else if (filterPath !== 'All') {
        // A node matches everything beneath it, so choosing Literature shows the
        // whole section rather than only what sits directly on it.
        if (!r.classification || !isUnderPath(r.classification, filterPath)) return false;
      }

      if (filterType !== 'All' && r.itemType !== filterType) return false;

      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, filterPath, filterType]);

  // Which shelves can legally be set on the current selection — gone with the
  // two-field scheme. A path is legal everywhere, so there is nothing to work out.

  function mark(id: number, on: boolean) {
    setSaving((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  async function saveField(id: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    mark(id, true);
    try {
      await fetch(`/api/items/${id}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } finally {
      mark(id, false);
    }
  }

  // Shift-click ranges run over `filtered` — the rows actually on screen, in
  // the order they are shown — so a range follows the current filter rather
  // than id order. The anchor is the last row clicked. Kept in a ref: it is
  // read during a click, never rendered, and putting it in state would rerender
  // the whole table on every tick.
  const anchorRef = useRef<number | null>(null);

  function toggle(id: number, shift = false) {
    // Read the anchor BEFORE setSelected. The updater does not run until React
    // re-renders, and the assignment at the end of this function has already
    // overwritten the ref by then — which made every shift-click a range from
    // the clicked row to itself.
    const anchor = anchorRef.current;
    setSelected((prev) => {
      const next = new Set(prev);
      const turningOn = !prev.has(id);
      if (shift && anchor !== null && anchor !== id) {
        const a = filtered.findIndex((r) => r.id === anchor);
        const b = filtered.findIndex((r) => r.id === id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) {
            if (turningOn) next.add(filtered[i].id);
            else next.delete(filtered[i].id);
          }
          return next;
        }
      }
      if (turningOn) next.add(id);
      else next.delete(id);
      return next;
    });
    anchorRef.current = id;
  }
  function toggleAll() {
    setSelected((s) => {
      const all = filtered.length > 0 && filtered.every((r) => s.has(r.id));
      const n = new Set(s);
      filtered.forEach((r) => (all ? n.delete(r.id) : n.add(r.id)));
      return n;
    });
    anchorRef.current = null;
  }

  const bulkWouldChange = bulkPath !== NO_CHANGE || bulkType !== NO_CHANGE;

  async function applyBulk() {
    const ids = [...selected];
    if (!ids.length || !bulkWouldChange) return;

    setBusyBulk(true);
    setBulkNote(null);
    const bits: string[] = [];

    try {
      if (bulkType !== NO_CHANGE) {
        const res = await fetch('/api/items/bulk-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, itemType: bulkType }),
        });
        const out = await res.json().catch(() => null);
        if (!res.ok) {
          bits.push(out?.error ? `Type not changed — ${out.error}` : 'Type not changed.');
        } else {
          setRows((rs) => rs.map((r) => (selected.has(r.id) ? { ...r, itemType: bulkType } : r)));
          bits.push(`${out?.updated ?? ids.length} set to ${bulkType}`);
        }
      }

      if (bulkPath !== NO_CHANGE) {
        const classification = bulkPath === CLEAR ? '' : bulkPath;
        const res = await fetch('/api/items/bulk-classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, classification }),
        });
        const out = await res.json().catch(() => null);
        if (!res.ok) {
          bits.push(out?.error ? `Not filed — ${out.error}` : 'Not filed.');
        } else {
          // No reconciliation to mirror: every selected row gets the value that
          // was sent, which is the whole benefit of filing by path.
          setRows((rs) =>
            rs.map((r) => (selected.has(r.id) ? { ...r, classification } : r)),
          );
          bits.push(
            `${out?.updated ?? ids.length} ${classification ? `filed under ${classification}` : 'unfiled'}`,
          );
        }
      }

      setBulkNote(bits.length ? bits.join(' · ') : null);
      setSelected(new Set());
      setBulkPath(NO_CHANGE);
      setBulkType(NO_CHANGE);
    } finally {
      setBusyBulk(false);
    }
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title…"
          className="rounded-md border border-line bg-card px-3 py-1.5 text-sm outline-none focus:border-rust"
        />
        <label className="text-sm text-muted">
          Filed under:{' '}
          <PathSelect
            value={filterPath}
            paths={paths}
            onChange={setFilterPath}
            className="rounded-md border border-line bg-card px-2 py-1 text-sm"
            extra={[
              { value: 'All', label: 'All' },
              { value: 'Unfiled', label: 'Unfiled' },
              { value: 'Filed', label: 'Filed' },
            ]}
          />
        </label>
        <label className="text-sm text-muted">
          Type:{' '}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-md border border-line bg-card px-2 py-1 text-sm"
          >
            <option>All</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <span className="text-sm text-muted">
          {filtered.length} shown · {filed} filed · {unfiled} unfiled
        </span>
        <span className="text-xs text-muted">
          Tick a row, then shift-click another to take everything between them.
        </span>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-3 rounded-md border border-rust/40 bg-card px-3 py-2 text-sm shadow-sm">
          <span className="font-medium">{selected.size} selected</span>
          <label>
            Filed under{' '}
            <PathSelect
              value={bulkPath}
              paths={paths}
              onChange={setBulkPath}
              className="rounded-md border border-line bg-card px-2 py-1"
              extra={[
                { value: NO_CHANGE, label: '— no change —' },
                { value: CLEAR, label: '— unfile —' },
              ]}
            />
          </label>
          <label>
            Type{' '}
            <select
              value={bulkType}
              onChange={(e) => setBulkType(e.target.value)}
              className="rounded-md border border-line bg-card px-2 py-1"
            >
              {/* No — clear — here, unlike section and shelf: every record is
                  something, and an empty type would just read as Book anyway. */}
              <option value={NO_CHANGE}>— no change —</option>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <button
            onClick={applyBulk}
            disabled={busyBulk || !bulkWouldChange}
            className="rounded-md bg-rust px-3 py-1 text-white disabled:opacity-50"
          >
            {busyBulk ? 'Applying…' : 'Apply'}
          </button>
          <button
            onClick={() => {
              setSelected(new Set());
              setBulkPath(NO_CHANGE);
              setBulkType(NO_CHANGE);
            }}
            className="text-muted hover:text-rust"
          >
            Clear
          </button>
        </div>
      )}

      {bulkNote && (
        <p className="mb-2 text-xs text-moss">{bulkNote}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-card text-left text-xs text-muted">
            <tr>
              <th className="w-8 px-2 py-2">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="select all" />
              </th>
              <th className="w-16 px-2 py-2">Cover</th>
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Filed under</th>
              <th className="px-2 py-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <ManageRow
                key={r.id}
                r={r}
                paths={paths}
                types={types}
                selected={selected.has(r.id)}
                saving={saving.has(r.id)}
                expanded={expanded === r.id}
                onToggle={(shift) => toggle(r.id, shift)}
                onExpand={() => setExpanded((e) => (e === r.id ? null : r.id))}
                onSave={saveField}
                genreSuggest={genreSuggest}
                subjectSuggest={subjectSuggest}
              />
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="mt-4 text-sm text-muted">Nothing matches.</p>}
    </div>
  );
}

function ManageRow({
  r, paths, types, selected, saving, expanded,
  onToggle, onExpand, onSave, genreSuggest, subjectSuggest,
}: {
  r: Row;
  paths: PathOption[];
  types: string[];
  selected: boolean;
  saving: boolean;
  expanded: boolean;
  onToggle: (shift: boolean) => void;
  onExpand: () => void;
  onSave: (id: number, patch: Partial<Row>) => void;
  genreSuggest: string[];
  subjectSuggest: string[];
}) {
  return (
    <>
      <tr className={`border-t border-line ${selected ? 'bg-rust/5' : ''}`}>
        <td className="px-2 py-2 align-top">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={(e) => onToggle(e.shiftKey)}
          />
        </td>
        <td className="px-2 py-2 align-top">
          <Link href={`/items/${r.id}`}>
            <Thumb src={r.thumb} title={r.title} />
          </Link>
        </td>
        <td className="px-2 py-2 align-top">
          <Link href={`/items/${r.id}`} className="text-rust hover:underline">{r.title}</Link>
          <span className="ml-2 font-mono text-[10px] text-muted">#{String(r.id).padStart(6, '0')}</span>
        </td>
        <td className="px-2 py-2 align-top">
          <select
            value={r.itemType}
            onChange={(e) => onSave(r.id, { itemType: e.target.value })}
            className="rounded border border-line bg-card px-1.5 py-1"
          >
            {types.map((t) => (<option key={t}>{t}</option>))}
          </select>
        </td>
        <td className="px-2 py-2 align-top">
          <PathSelect
            value={r.classification}
            paths={paths}
            onChange={(v) => onSave(r.id, { classification: v })}
            className={`max-w-[18rem] rounded border px-1.5 py-1 ${
              r.classification ? 'border-line bg-card' : 'border-amber-400 bg-amber-50'
            }`}
          />
        </td>
        <td className="px-2 py-2 align-top">
          <button onClick={onExpand} className="text-xs text-muted hover:text-rust">
            {r.genres.length + r.subjects.length} tags {expanded ? '▲' : '▾'}
          </button>
          {saving && <span className="ml-2 text-xs text-moss">saving…</span>}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-line bg-parchment">
          <td />
          <td colSpan={5} className="px-2 py-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Chips
                label="Genres"
                values={r.genres}
                suggest={genreSuggest}
                onChange={(v) => onSave(r.id, { genres: v })}
              />
              <Chips
                label="Subjects"
                values={r.subjects}
                suggest={subjectSuggest}
                onChange={(v) => onSave(r.id, { subjects: v })}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Chips({
  label, values, suggest, onChange,
}: {
  label: string;
  values: string[];
  suggest: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const listId = `sug-${label}`;
  function add() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  }
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded bg-moss/10 px-2 py-0.5 text-xs text-moss">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`remove ${v}`} className="hover:text-rust">✕</button>
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        <input
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={`add ${label.toLowerCase().replace(/s$/, '')}…`}
          className="w-40 rounded border border-line bg-card px-2 py-1 text-xs outline-none focus:border-rust"
        />
        <datalist id={listId}>
          {suggest.map((s) => (<option key={s} value={s} />))}
        </datalist>
        <button onClick={add} className="rounded border border-line px-2 py-1 text-xs hover:border-rust">add</button>
      </div>
    </div>
  );
}
