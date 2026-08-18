'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Row = {
  id: number;
  title: string;
  section: string;
  shelf: string;
  genres: string[];
  subjects: string[];
};

// Shelves available for a section, always including the row's current shelf.
function shelfOptions(sbs: Record<string, string[]>, section: string, current: string): string[] {
  const list = sbs[section] || [];
  const merged = current && !list.includes(current) ? [...list, current] : list;
  return [...merged].sort((a, b) => a.localeCompare(b));
}

// Every shelf name across all sections, de-duped — for filtering when no section is
// chosen. Shelves are section-scoped, so a name like "Maritime" can appear under more
// than one section; matching by name here is deliberate, and is what makes "show me
// everything on a Maine shelf" work.
function allShelfNames(sbs: Record<string, string[]>): string[] {
  return Array.from(new Set(Object.values(sbs).flat())).sort((a, b) => a.localeCompare(b));
}

// Sentinels for the bulk bar. Splitting "leave alone" from "clear" matters: the old
// single — none — default meant one stray click on Apply with everything selected
// would wipe the section off the whole catalogue.
const NO_CHANGE = '__nochange__';
const CLEAR = '__clear__';

export default function ManageTable({
  rows: initial,
  sections,
  shelvesBySection,
  genreSuggest,
  subjectSuggest,
}: {
  rows: Row[];
  sections: string[];
  shelvesBySection: Record<string, string[]>;
  genreSuggest: string[];
  subjectSuggest: string[];
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [q, setQ] = useState('');
  const [filterSection, setFilterSection] = useState('All');
  const [filterShelf, setFilterShelf] = useState('All');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkSection, setBulkSection] = useState(NO_CHANGE);
  const [bulkShelf, setBulkShelf] = useState(NO_CHANGE);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [busyBulk, setBusyBulk] = useState(false);

  const unsorted = rows.filter((r) => !r.section).length;
  // Items that have a section but no shelf — the actionable shelving backlog. An
  // item with no section can't meaningfully have one, so those aren't counted here.
  const unshelved = rows.filter((r) => r.section && !r.shelf).length;

  const flatShelves = useMemo(() => allShelfNames(shelvesBySection), [shelvesBySection]);

  // With a section chosen, offer only its shelves; otherwise the flat union.
  const filterShelfChoices = useMemo(
    () =>
      filterSection !== 'All' && filterSection !== 'Unsorted'
        ? shelfOptions(shelvesBySection, filterSection, '')
        : flatShelves,
    [filterSection, shelvesBySection, flatShelves],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterSection === 'Unsorted' ? !!r.section : filterSection !== 'All' && r.section !== filterSection)
        return false;
      if (filterShelf === 'Unshelved' ? !!r.shelf : filterShelf !== 'All' && r.shelf !== filterShelf)
        return false;
      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, filterSection, filterShelf]);

  // Which shelves can legally be set on the current selection. If a section is being
  // set at the same time, that section's shelves are all valid. Otherwise only shelves
  // common to every selected item's existing section are — anything else would be
  // rejected per-item by the API.
  const bulkShelfChoices = useMemo(() => {
    if (bulkSection !== NO_CHANGE && bulkSection !== CLEAR) {
      return shelfOptions(shelvesBySection, bulkSection, '');
    }
    const sections = new Set(
      rows.filter((r) => selected.has(r.id)).map((r) => r.section).filter(Boolean),
    );
    if (!sections.size) return [];
    let inter: string[] | null = null;
    for (const s of sections) {
      const list = shelvesBySection[s] || [];
      inter = inter === null ? [...list] : inter.filter((x) => list.includes(x));
    }
    return (inter || []).sort((a, b) => a.localeCompare(b));
  }, [bulkSection, rows, selected, shelvesBySection]);

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

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => {
      const all = filtered.length > 0 && filtered.every((r) => s.has(r.id));
      const n = new Set(s);
      filtered.forEach((r) => (all ? n.delete(r.id) : n.add(r.id)));
      return n;
    });
  }

  const bulkWouldChange = bulkSection !== NO_CHANGE || bulkShelf !== NO_CHANGE;

  async function applyBulk() {
    const ids = [...selected];
    if (!ids.length || !bulkWouldChange) return;

    const payload: { ids: number[]; section?: string; shelf?: string } = { ids };
    if (bulkSection !== NO_CHANGE) payload.section = bulkSection === CLEAR ? '' : bulkSection;
    if (bulkShelf !== NO_CHANGE) payload.shelf = bulkShelf === CLEAR ? '' : bulkShelf;

    setBusyBulk(true);
    setBulkNote(null);
    try {
      const res = await fetch('/api/items/bulk-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => null);

      setRows((rs) =>
        rs.map((r) => {
          if (!selected.has(r.id)) return r;
          const section = payload.section !== undefined ? payload.section : r.section;
          let shelf = payload.shelf !== undefined ? payload.shelf : r.shelf;
          // mirror the server's rules so the table doesn't drift from what was written
          if (shelf && !(shelvesBySection[section] || []).includes(shelf)) shelf = '';
          return { ...r, section, shelf };
        }),
      );

      const bits: string[] = [];
      if (out?.updated) bits.push(`${out.updated} updated`);
      if (out?.shelvesCleared) bits.push(`${out.shelvesCleared} shelf cleared as invalid for the new section`);
      if (out?.skipped) bits.push(`${out.skipped} skipped — that shelf isn't under their section`);
      setBulkNote(bits.length ? bits.join(' · ') : null);

      setSelected(new Set());
      setBulkSection(NO_CHANGE);
      setBulkShelf(NO_CHANGE);
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
          Section:{' '}
          <select
            value={filterSection}
            onChange={(e) => {
              const ns = e.target.value;
              setFilterSection(ns);
              // a shelf filter that isn't offered under the new section would silently
              // show nothing, so drop back to All rather than leave a dead filter set
              if (filterShelf !== 'All' && filterShelf !== 'Unshelved') {
                const allowed =
                  ns !== 'All' && ns !== 'Unsorted' ? shelvesBySection[ns] || [] : flatShelves;
                if (!allowed.includes(filterShelf)) setFilterShelf('All');
              }
            }}
            className="rounded-md border border-line bg-card px-2 py-1 text-sm"
          >
            <option>All</option>
            <option>Unsorted</option>
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Shelf:{' '}
          <select
            value={filterShelf}
            onChange={(e) => setFilterShelf(e.target.value)}
            className="rounded-md border border-line bg-card px-2 py-1 text-sm"
          >
            <option>All</option>
            <option>Unshelved</option>
            {filterShelfChoices.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="text-sm text-muted">
          {filtered.length} shown · {unsorted} unsorted · {unshelved} unshelved
        </span>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-3 rounded-md border border-rust/40 bg-rust/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <label>
            Section{' '}
            <select
              value={bulkSection}
              onChange={(e) => {
                const ns = e.target.value;
                setBulkSection(ns);
                // the shelf list is about to change under it; don't carry a stale pick
                setBulkShelf(NO_CHANGE);
              }}
              className="rounded-md border border-line bg-card px-2 py-1"
            >
              <option value={NO_CHANGE}>— no change —</option>
              <option value={CLEAR}>— clear —</option>
              {sections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Shelf{' '}
            <select
              value={bulkShelf}
              onChange={(e) => setBulkShelf(e.target.value)}
              className="rounded-md border border-line bg-card px-2 py-1 disabled:opacity-40"
              disabled={bulkShelfChoices.length === 0 && bulkShelf === NO_CHANGE}
              title={
                bulkShelfChoices.length === 0
                  ? 'The selected items span sections with no shelf in common — set a section too.'
                  : undefined
              }
            >
              <option value={NO_CHANGE}>— no change —</option>
              <option value={CLEAR}>— clear —</option>
              {bulkShelfChoices.map((s) => (
                <option key={s}>{s}</option>
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
              setBulkSection(NO_CHANGE);
              setBulkShelf(NO_CHANGE);
            }}
            className="text-muted hover:text-rust"
          >
            Clear
          </button>
          {bulkShelfChoices.length === 0 && bulkSection === NO_CHANGE && (
            <span className="text-xs text-muted">
              No shelf is common to every selected item’s section — set a section to shelve them together.
            </span>
          )}
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
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2">Section</th>
              <th className="px-2 py-2">Shelf</th>
              <th className="px-2 py-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <ManageRow
                key={r.id}
                r={r}
                sections={sections}
                shelvesBySection={shelvesBySection}
                selected={selected.has(r.id)}
                saving={saving.has(r.id)}
                expanded={expanded === r.id}
                onToggle={() => toggle(r.id)}
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
  r, sections, shelvesBySection, selected, saving, expanded,
  onToggle, onExpand, onSave, genreSuggest, subjectSuggest,
}: {
  r: Row;
  sections: string[];
  shelvesBySection: Record<string, string[]>;
  selected: boolean;
  saving: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onSave: (id: number, patch: Partial<Row>) => void;
  genreSuggest: string[];
  subjectSuggest: string[];
}) {
  return (
    <>
      <tr className={`border-t border-line ${selected ? 'bg-rust/5' : ''}`}>
        <td className="px-2 py-2 align-top">
          <input type="checkbox" checked={selected} onChange={onToggle} />
        </td>
        <td className="px-2 py-2 align-top">
          <Link href={`/items/${r.id}`} className="text-rust hover:underline">{r.title}</Link>
          <span className="ml-2 font-mono text-[10px] text-muted">#{String(r.id).padStart(6, '0')}</span>
        </td>
        <td className="px-2 py-2 align-top">
          <select
            value={r.section}
            onChange={(e) => {
              const ns = e.target.value;
              const keep = (shelvesBySection[ns] || []).includes(r.shelf);
              onSave(r.id, keep ? { section: ns } : { section: ns, shelf: '' });
            }}
            className={`rounded border px-1.5 py-1 ${r.section ? 'border-line bg-card' : 'border-amber-400 bg-amber-50'}`}
          >
            <option value="">— none —</option>
            {sections.map((s) => (<option key={s}>{s}</option>))}
          </select>
        </td>
        <td className="px-2 py-2 align-top">
          <select
            value={r.shelf}
            disabled={!r.section}
            onChange={(e) => onSave(r.id, { shelf: e.target.value })}
            className="rounded border border-line bg-card px-1.5 py-1 disabled:opacity-40"
          >
            <option value="">— none —</option>
            {shelfOptions(shelvesBySection, r.section, r.shelf).map((s) => (<option key={s}>{s}</option>))}
          </select>
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
          <td colSpan={4} className="px-2 py-3">
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
