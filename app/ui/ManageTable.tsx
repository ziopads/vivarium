'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { isUnderPath, pathServesType, type PathOption, type TaxonNode } from '@/lib/taxonomy';
import { typeOptions } from '@/lib/itemTypes';
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

/** No paths for a type nobody tagged. One identity, so a row does not rerender. */
const NO_PATHS: PathOption[] = [];

export default function ManageTable({
  rows: initial,
  paths,
  pathsByType,
  tree,
  genreSuggest,
  subjectSuggest,
  types,
}: {
  rows: Row[];
  /** Every path in the tree — for the filter and the bulk bar, which act over a
   *  mixed selection and have no single item in hand. */
  paths: PathOption[];
  /** Pickable paths keyed by item type — for the per-row picker. */
  pathsByType: Record<string, PathOption[]>;
  /** The classification tree, for recomputing the mis-filing flag after an edit. */
  tree: TaxonNode[];
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
  // A refused filing, held so the operator can send it again with `force`. The
  // API refuses a path whose types the selection does not match; the selection
  // is cleared on success, so the retry has to carry its own ids rather than
  // reading them back off the table.
  const [override, setOverride] = useState<
    | { kind: 'file'; ids: number[]; classification: string }
    | { kind: 'type'; ids: number[]; itemType: string }
    | null
  >(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [busyBulk, setBusyBulk] = useState(false);

  const unfiled = rows.filter((r) => !r.classification).length;
  const filed = rows.length - unfiled;

  /**
   * Records filed somewhere their own type is not served by.
   *
   * Recomputed in the browser rather than sent from the server, because the two
   * edits that CREATE this state — retyping a row and refiling it — both happen
   * here without a reload. A flag computed on the server would be right until the
   * moment it mattered.
   *
   * Nothing is unfiled and nothing is lost: the record keeps its path. What it
   * loses is being offered that path again, since its own picker no longer lists
   * it — so without a mark on the row there is nothing anywhere to say so.
   */
  const misfiled = useMemo(() => {
    const out = new Set<number>();
    for (const r of rows) {
      if (r.classification && !pathServesType(tree, r.classification, r.itemType)) out.add(r.id);
    }
    return out;
  }, [rows, tree]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterPath === 'Unfiled') {
        if (r.classification) return false;
      } else if (filterPath === 'Filed') {
        if (!r.classification) return false;
      } else if (filterPath === 'Misfiled') {
        if (!misfiled.has(r.id)) return false;
      } else if (filterPath !== 'All') {
        // A node matches everything beneath it, so choosing Literature shows the
        // whole section rather than only what sits directly on it.
        if (!r.classification || !isUnderPath(r.classification, filterPath)) return false;
      }

      if (filterType !== 'All' && r.itemType !== filterType) return false;

      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, filterPath, filterType, misfiled]);

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

  /**
   * Change one row's type, asking first when the change would strand it.
   *
   * A retype does not move the record and does not unfile it. What it does is
   * leave it filed somewhere its new type is not served by, where its own picker
   * will no longer offer that place — so the change is worth stating before it
   * happens rather than only marking afterwards.
   */
  function retype(r: Row, next: string) {
    if (
      r.classification &&
      !pathServesType(tree, r.classification, next) &&
      !window.confirm(
        `${r.title || `#${r.id}`} is filed under ${r.classification}, which does not serve ` +
          `${next}. Change the type anyway? It stays where it is and stops being offered ` +
          `that place.`,
      )
    ) {
      return;
    }
    saveField(r.id, { itemType: next });
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
    setOverride(null);
    const bits: string[] = [];

    try {
      // Type first, then filing. A selection being retyped AND refiled in one
      // click has to change type before the destination checks what types it
      // holds, or the check runs against the types they are leaving.
      //
      // A refused retype STOPS the filing step as well. Filing after a type
      // change that did not happen would check the destination against the types
      // the records still are, and quietly file them somewhere the type they were
      // being given is not served by — the exact state both guards exist to make
      // visible.
      let typeRefused = false;
      if (bulkType !== NO_CHANGE) {
        const out = await typeThem(ids, bulkType);
        if (out.error) {
          bits.push(`Type not changed — ${out.error}`);
          if (out.status === 409) setOverride({ kind: 'type', ids, itemType: bulkType });
          typeRefused = true;
        } else {
          bits.push(out.note);
        }
      }

      if (bulkPath !== NO_CHANGE && !typeRefused) {
        const classification = bulkPath === CLEAR ? '' : bulkPath;
        const out = await fileThem(ids, classification);
        if (out.error) {
          bits.push(`Not filed — ${out.error}`);
          // 409 is the type refusal, and the only failure worth offering again.
          if (out.status === 409) setOverride({ kind: 'file', ids, classification });
        } else {
          bits.push(out.note);
        }
      } else if (bulkPath !== NO_CHANGE) {
        bits.push('Filing skipped');
      }

      setBulkNote(bits.length ? bits.join(' · ') : null);
      setSelected(new Set());
      setBulkPath(NO_CHANGE);
      setBulkType(NO_CHANGE);
    } finally {
      setBusyBulk(false);
    }
  }

  /** One retype request, shared by the normal apply and the override. */
  async function typeThem(
    ids: number[],
    itemType: string,
    force = false,
  ): Promise<{ note: string; error?: string; status?: number }> {
    const res = await fetch('/api/items/bulk-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, itemType, force }),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok) {
      return { note: '', error: out?.error || 'the request failed.', status: res.status };
    }
    const touched = new Set(ids);
    setRows((rs) => rs.map((r) => (touched.has(r.id) ? { ...r, itemType } : r)));
    return { note: `${out?.updated ?? ids.length} set to ${itemType}` };
  }

  /**
   * One filing request, shared by the normal apply and the override.
   *
   * Returns the note to show rather than setting it, since the caller is
   * assembling a line out of two operations.
   */
  async function fileThem(
    ids: number[],
    classification: string,
    force = false,
  ): Promise<{ note: string; error?: string; status?: number }> {
    const res = await fetch('/api/items/bulk-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, classification, force }),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok) {
      return { note: '', error: out?.error || 'the request failed.', status: res.status };
    }
    // No reconciliation to mirror: every selected row gets the value that was
    // sent, which is the whole benefit of filing by path.
    const touched = new Set(ids);
    setRows((rs) => rs.map((r) => (touched.has(r.id) ? { ...r, classification } : r)));
    return {
      note: `${out?.updated ?? ids.length} ${
        classification ? `filed under ${classification}` : 'unfiled'
      }`,
    };
  }

  async function applyOverride() {
    if (!override) return;
    setBusyBulk(true);
    try {
      const out =
        override.kind === 'file'
          ? await fileThem(override.ids, override.classification, true)
          : await typeThem(override.ids, override.itemType, true);
      setBulkNote(out.error ? `Not changed — ${out.error}` : `${out.note} anyway`);
      setOverride(null);
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
              { value: 'Misfiled', label: 'Mis-filed' },
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
          {misfiled.size > 0 && (
            <>
              {' · '}
              <button
                onClick={() => setFilterPath('Misfiled')}
                className="text-rust hover:underline"
              >
                {misfiled.size} mis-filed
              </button>
            </>
          )}
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
        <p className="mb-2 flex flex-wrap items-center gap-3 text-xs text-moss">
          <span className={override ? 'text-rust' : undefined}>{bulkNote}</span>
          {override && (
            <>
              <button
                onClick={applyOverride}
                disabled={busyBulk}
                className="rounded border border-rust px-2 py-0.5 text-rust hover:bg-rust hover:text-white disabled:opacity-50"
              >
                {override.kind === 'file'
                  ? `File ${override.ids.length} there anyway`
                  : `Set ${override.ids.length} to ${override.itemType} anyway`}
              </button>
              <button onClick={() => setOverride(null)} className="text-muted hover:text-rust">
                Leave them
              </button>
            </>
          )}
        </p>
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
                paths={pathsByType[r.itemType] ?? NO_PATHS}
                misfiled={misfiled.has(r.id)}
                types={types}
                selected={selected.has(r.id)}
                saving={saving.has(r.id)}
                expanded={expanded === r.id}
                onToggle={(shift) => toggle(r.id, shift)}
                onExpand={() => setExpanded((e) => (e === r.id ? null : r.id))}
                onSave={saveField}
                onRetype={(next) => retype(r, next)}
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
  r, paths, misfiled, types, selected, saving, expanded,
  onToggle, onExpand, onSave, onRetype, genreSuggest, subjectSuggest,
}: {
  r: Row;
  /** Scoped to this row's item type. */
  paths: PathOption[];
  /** Filed somewhere this row's type is not served by. */
  misfiled: boolean;
  types: string[];
  selected: boolean;
  saving: boolean;
  expanded: boolean;
  onToggle: (shift: boolean) => void;
  onExpand: () => void;
  onSave: (id: number, patch: Partial<Row>) => void;
  onRetype: (next: string) => void;
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
          {/* The row's own type is unioned in. A <select> whose value matches no
              <option> renders the first one instead, so a record typed outside
              the vocabulary would display as Book while still being a Recording
              — and the next edit to any control on this row saves that display
              value. Browse unions the same way when building its filing
              pickers, for the same reason. */}
          <select
            value={r.itemType}
            onChange={(e) => onRetype(e.target.value)}
            className="rounded border border-line bg-card px-1.5 py-1"
          >
            {typeOptions(types, r.itemType).map((t) => (<option key={t}>{t}</option>))}
          </select>
        </td>
        <td className="px-2 py-2 align-top">
          <PathSelect
            value={r.classification}
            paths={paths}
            onChange={(v) => onSave(r.id, { classification: v })}
            unknownNote={
              // Two reasons a stored path is missing from a scoped list, and the
              // row knows which. Mis-filed means the path is real and this type
              // is not served by it; otherwise it has been renamed or deleted out
              // of the tree and is not a path at all any more.
              misfiled ? '— not served by this type' : '(not in the classification)'
            }
            className={`max-w-[18rem] rounded border px-1.5 py-1 ${
              misfiled
                ? 'border-rust bg-rust/5'
                : r.classification
                  ? 'border-line bg-card'
                  : 'border-amber-400 bg-amber-50'
            }`}
          />
          {misfiled && (
            <p
              className="mt-1 max-w-[18rem] text-[11px] text-rust"
              title={`${r.itemType} is not served by ${r.classification}`}
            >
              ⚠ Filed where {r.itemType} is not served. It stays here, and no picker will offer
              this place again.
            </p>
          )}
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
