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

export default function ManageTable({
  rows: initial,
  sections,
  shelves,
  genreSuggest,
  subjectSuggest,
}: {
  rows: Row[];
  sections: string[];
  shelves: string[];
  genreSuggest: string[];
  subjectSuggest: string[];
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [q, setQ] = useState('');
  const [filterSection, setFilterSection] = useState('All');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkSection, setBulkSection] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [busyBulk, setBusyBulk] = useState(false);

  const unsorted = rows.filter((r) => !r.section).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterSection === 'Unsorted' ? !!r.section : filterSection !== 'All' && r.section !== filterSection)
        return false;
      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, filterSection]);

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

  async function applyBulk() {
    const ids = [...selected];
    if (!ids.length) return;
    setBusyBulk(true);
    try {
      await fetch('/api/items/bulk-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, section: bulkSection }),
      });
      setRows((rs) => rs.map((r) => (selected.has(r.id) ? { ...r, section: bulkSection } : r)));
      setSelected(new Set());
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
            onChange={(e) => setFilterSection(e.target.value)}
            className="rounded-md border border-line bg-card px-2 py-1 text-sm"
          >
            <option>All</option>
            <option>Unsorted</option>
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="text-sm text-muted">
          {filtered.length} shown · {unsorted} unsorted
        </span>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-3 rounded-md border border-rust/40 bg-rust/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <label>
            Set section to{' '}
            <select
              value={bulkSection}
              onChange={(e) => setBulkSection(e.target.value)}
              className="rounded-md border border-line bg-card px-2 py-1"
            >
              <option value="">— none —</option>
              {sections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button
            onClick={applyBulk}
            disabled={busyBulk}
            className="rounded-md bg-rust px-3 py-1 text-white disabled:opacity-50"
          >
            {busyBulk ? 'Applying…' : 'Apply'}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-muted hover:text-rust">
            Clear
          </button>
        </div>
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
                shelves={shelves}
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
  r, sections, shelves, selected, saving, expanded,
  onToggle, onExpand, onSave, genreSuggest, subjectSuggest,
}: {
  r: Row;
  sections: string[];
  shelves: string[];
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
            onChange={(e) => onSave(r.id, { section: e.target.value })}
            className={`rounded border px-1.5 py-1 ${r.section ? 'border-line bg-card' : 'border-amber-400 bg-amber-50'}`}
          >
            <option value="">— none —</option>
            {sections.map((s) => (<option key={s}>{s}</option>))}
          </select>
        </td>
        <td className="px-2 py-2 align-top">
          <select
            value={r.shelf}
            onChange={(e) => onSave(r.id, { shelf: e.target.value })}
            className="rounded border border-line bg-card px-1.5 py-1"
          >
            <option value="">— none —</option>
            {shelves.map((s) => (<option key={s}>{s}</option>))}
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
