'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Item } from '@/lib/types';
import { CONDITIONS } from '@/lib/sections';
import { coverImage, imageUrl } from '@/lib/img';
import { needsWriteup } from '@/lib/writeup';
import {
  VISIBILITY,
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  VISIBILITY_MARK,
  normalizeVisibility,
  type Visibility,
} from '@/lib/visibility';

/**
 * Row thumbnail. Lives inside the sticky Title column deliberately: the Section
 * dropdown sits far to the right, and a non-sticky thumbnail would scroll out of
 * view at the moment you need to see the work to categorise it.
 *
 * Renders a dashed placeholder rather than nothing when there is no image, so
 * row heights stay even and a missing image reads as a fact about the record.
 */
function Thumb({ item }: { item: Item }) {
  const img = coverImage(item);
  if (!img) {
    return (
      <span
        aria-hidden
        title="No image"
        className="mt-0.5 block h-10 w-10 shrink-0 rounded border border-dashed border-line"
      />
    );
  }
  return (
    <img
      src={imageUrl(img, 'thumb')}
      alt=""
      loading="lazy"
      className="mt-0.5 h-10 w-10 shrink-0 rounded border border-line bg-parchment object-cover"
    />
  );
}

/**
 * A <select> that does not build its options until you reach for it.
 *
 * With 1,600 rows, three dropdowns per row and 26 sections in the first of
 * them, the table was putting 60,000-odd <option> nodes into the document, and
 * every re-render walked all of them — which is most of why typing in the
 * search box felt like a freeze. Closed, this renders one option: the current
 * value, which is all a closed control ever displays. The full list fills in on
 * hover or focus, before any click can open the popup.
 *
 * `options` may be a function so that per-row work (sorting a section's shelves)
 * is skipped for the rows you never touch.
 */
function LazySelect({
  value,
  options,
  onChange,
  className,
  disabled = false,
}: {
  value: string;
  options: string[] | (() => string[]);
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  let list: string[];
  if (!open) {
    list = value ? [value] : [];
  } else {
    const base = typeof options === 'function' ? options() : options;
    // A value the vocabulary no longer lists would otherwise vanish from its own
    // dropdown the moment you opened it.
    list = value && !base.includes(value) ? [...base, value] : base;
  }
  return (
    <select
      value={value}
      disabled={disabled}
      className={className}
      onPointerEnter={() => setOpen(true)}
      onFocus={() => setOpen(true)}
      onPointerDown={() => setOpen(true)}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— none —</option>
      {list.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

type Row = Item;
type Patch = Partial<
  Pick<
    Item,
    | 'section'
    | 'shelf'
    | 'genres'
    | 'subjects'
    | 'location'
    | 'notes'
    | 'condition'
    | 'conditionNotes'
    | 'visibility'
  >
>;

/**
 * Visibility cell control.
 *
 * A plain <select> rather than the LazySelect used for section and shelf. That
 * one always offers "— none —", and a record always has a tier, so an empty
 * option here would be a way to write a value that means nothing. Three options
 * is also well under the count that made deferred building worth it.
 */
function VisSelect({
  value,
  onChange,
  className,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      className={className}
      onChange={(e) => onChange(e.target.value as Visibility)}
    >
      {VISIBILITY.map((v) => (
        <option key={v} value={v} title={VISIBILITY_HINT[v]}>
          {VISIBILITY_LABEL[v]}
        </option>
      ))}
    </select>
  );
}

// Shelves for a section (alphabetized), always including the row's current shelf.
function shelfOpts(sbs: Record<string, string[]>, section: string, current: string): string[] {
  const list = sbs[section] || [];
  const merged = current && !list.includes(current) ? [...list, current] : list;
  return [...merged].sort((a, b) => a.localeCompare(b));
}

type CellClasses = { tdId: string; tdTitle: string; cell: string; sel: string };

/**
 * A cell that shows its value as text and becomes a control when you reach for
 * it.
 *
 * The list renders three dropdowns and six text inputs per row. At 1,700 rows
 * that is fifteen thousand form controls — the most expensive elements a
 * browser creates, hydrates and reconciles, and the reason the list view felt
 * so much heavier than the card view under the same filters.
 *
 * The swap happens on pointer enter, not on click, so the control is already
 * there by the time you press: editing still costs one click. Keyboard reaches
 * it too, since the resting span is focusable.
 *
 * SECOND BENEFIT, and not a small one: browser find-in-page cannot see text
 * inside an input. Genres, subjects, notes, location and condition notes were
 * invisible to Command-F. As text at rest, they are searchable for the first
 * time.
 */
function HoverEdit({
  display,
  children,
}: {
  // ReactNode rather than string so a cell can colour its own resting value —
  // the visibility column sets the two closed tiers in the accent. An element is
  // always truthy, so such a cell never falls through to the em-dash below,
  // which is right for a field that always has a value.
  display: React.ReactNode;
  children: React.ReactNode;
}) {
  const [live, setLive] = useState(false);
  const over = useRef(false);
  const focused = useRef(false);

  const settle = () => {
    if (!over.current && !focused.current) setLive(false);
  };

  return (
    <div
      onPointerEnter={() => {
        over.current = true;
        setLive(true);
      }}
      onPointerLeave={() => {
        over.current = false;
        settle();
      }}
      onFocus={() => {
        focused.current = true;
        setLive(true);
      }}
      onBlur={() => {
        // The control's own onBlur has already fired and saved by the time this
        // bubbles, so dropping back to text cannot lose an edit.
        focused.current = false;
        settle();
      }}
    >
      {live ? (
        children
      ) : (
        <span
          tabIndex={0}
          className="block truncate rounded border border-transparent px-1 py-0.5 outline-none"
        >
          {display || <span className="text-muted">—</span>}
        </span>
      )}
    </div>
  );
}

/**
 * One row, memoized.
 *
 * setRows replaces only the edited record's object and leaves the other 1,600
 * identities alone, so with a shallow prop compare a save re-renders one row
 * instead of reconciling the whole table. That only holds if `save` and `pick`
 * keep the same identity between renders — see the refs in CatalogList — and if
 * the class strings are the same literals each time, which they are.
 */
const TableRow = memo(function TableRow({
  r,
  editable,
  selected,
  isSaved,
  sections,
  shelvesBySection,
  classes,
  save,
  pick,
}: {
  r: Row;
  editable: boolean;
  selected: boolean;
  isSaved: boolean;
  sections: string[];
  shelvesBySection: Record<string, string[]>;
  classes: CellClasses;
  save: (id: number, patch: Patch) => void;
  pick: (id: number, shift: boolean) => void;
}) {
  const { tdId, tdTitle, cell, sel } = classes;
  const ro = !editable;
  const vis = normalizeVisibility(r.visibility);
  const visCls = vis === 'public' ? 'text-muted' : 'text-moss';
  const toList = (s: string) =>
    Array.from(new Set(s.split(',').map((x) => x.trim()).filter(Boolean)));

  return (
    <tr className="row-offscreen border-b border-line/60 align-top">
      <td className={tdId}>
        {editable && (
          <input
            type="checkbox"
            className="mr-1.5 align-middle"
            checked={selected}
            onChange={() => {}}
            onClick={(e) => pick(r.id, e.shiftKey)}
            aria-label={`select ${r.title || r.id}`}
          />
        )}
        {String(r.id).padStart(6, '0')}
        {isSaved && <span className="ml-1 text-moss">✓</span>}
      </td>
      <td className={tdTitle}>
        {/* Same marker, same condition, as the card view — see lib/writeup.ts.
            It sits in the sticky Title column for the same reason the thumbnail
            does: the table is wider than the screen, and a mark in a scrolling
            column is gone at the moment you are deciding. */}
        {needsWriteup(r) && (
          <span
            aria-hidden
            title="Write-up incomplete"
            className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[14px] border-t-[14px] border-l-transparent border-t-amber-400"
          />
        )}
        <Link href={`/items/${r.id}`} className="flex items-start gap-2 hover:text-rust">
          <Thumb item={r} />
          <span className="font-serif leading-snug hover:underline">
            {r.title || <em className="text-muted">Untitled</em>}
          </span>
        </Link>
      </td>
      <td className="px-2 py-1.5 text-muted">{r.author}</td>
      <td className="px-2 py-1.5 text-muted">{r.year}</td>

      {/* Visibility — the three tiers in lib/visibility.ts. Public is the
          default and much the commonest value, so it rests in the muted colour
          and the two closed tiers carry the accent: on a pass through the list
          what you are looking for is the exceptions. */}
      <td className="px-2 py-1.5">
        {editable ? (
          <HoverEdit
            display={
              <span className={visCls}>
                {VISIBILITY_MARK[vis]} {VISIBILITY_LABEL[vis]}
              </span>
            }
          >
            <VisSelect
              value={vis}
              className={`w-full ${sel}`}
              onChange={(v) => save(r.id, { visibility: v })}
            />
          </HoverEdit>
        ) : (
          <span className={`px-1 ${visCls}`}>
            {VISIBILITY_MARK[vis]} {VISIBILITY_LABEL[vis]}
          </span>
        )}
      </td>

      {/* Section — controlled dropdown */}
      <td className="px-2 py-1.5">
        {editable ? (
          <HoverEdit display={r.section || ''}>
            <LazySelect
              value={r.section || ''}
              options={sections}
              className={`w-full ${sel}`}
              onChange={(ns) => {
                const keep = (shelvesBySection[ns] || []).includes(r.shelf);
                save(r.id, keep ? { section: ns } : { section: ns, shelf: '' });
              }}
            />
          </HoverEdit>
        ) : (
          <span className="px-1">{r.section}</span>
        )}
      </td>

      {/* Shelf — section-aware dropdown */}
      <td className="px-2 py-1.5">
        {editable ? (
          <HoverEdit display={r.shelf || ''}>
            <LazySelect
              value={r.shelf || ''}
              disabled={!r.section}
              options={() => shelfOpts(shelvesBySection, r.section || '', r.shelf)}
              className={`w-full ${sel} disabled:opacity-40`}
              onChange={(v) => save(r.id, { shelf: v })}
            />
          </HoverEdit>
        ) : (
          <span className="px-1">{r.shelf}</span>
        )}
      </td>

      <td className="px-2 py-1.5">
        <HoverEdit display={r.genres.join(', ')}>
          <input
            list="genreopts"
            readOnly={ro}
            defaultValue={r.genres.join(', ')}
            onBlur={(e) => {
              if (!editable) return;
              const v = toList(e.target.value);
              if (v.join('|') !== r.genres.join('|')) save(r.id, { genres: v });
            }}
            className={`w-full ${cell}`}
          />
        </HoverEdit>
      </td>
      <td className="px-2 py-1.5">
        <HoverEdit display={r.subjects.join(', ')}>
          <input
            readOnly={ro}
            defaultValue={r.subjects.join(', ')}
            onBlur={(e) => {
              if (!editable) return;
              const v = toList(e.target.value);
              if (v.join('|') !== r.subjects.join('|')) save(r.id, { subjects: v });
            }}
            className={`w-full ${cell}`}
          />
        </HoverEdit>
      </td>
      <td className="px-2 py-1.5">
        <HoverEdit display={r.location || ''}>
          <input
            list="locopts"
            readOnly={ro}
            defaultValue={r.location || ''}
            onBlur={(e) =>
              editable &&
              e.target.value !== (r.location || '') &&
              save(r.id, { location: e.target.value.trim() })
            }
            className={`w-full ${cell}`}
          />
        </HoverEdit>
      </td>
      <td className="px-2 py-1.5">
        <HoverEdit display={r.notes || ''}>
          <input
            readOnly={ro}
            defaultValue={r.notes || ''}
            onBlur={(e) =>
              editable && e.target.value !== (r.notes || '') && save(r.id, { notes: e.target.value })
            }
            className={`w-full ${cell}`}
          />
        </HoverEdit>
      </td>

      {/* Condition — controlled dropdown */}
      <td className="px-2 py-1.5">
        {editable ? (
          <HoverEdit display={r.condition || ''}>
            <LazySelect
              value={r.condition || ''}
              options={CONDITIONS as unknown as string[]}
              className={`w-full ${sel}`}
              onChange={(v) => save(r.id, { condition: v })}
            />
          </HoverEdit>
        ) : (
          <span className="px-1">{r.condition}</span>
        )}
      </td>

      <td className="px-2 py-1.5">
        <HoverEdit display={r.conditionNotes || ''}>
          <input
            readOnly={ro}
            defaultValue={r.conditionNotes || ''}
            onBlur={(e) =>
              editable &&
              e.target.value !== (r.conditionNotes || '') &&
              save(r.id, { conditionNotes: e.target.value })
            }
            className={`w-full ${cell}`}
          />
        </HoverEdit>
      </td>
    </tr>
  );
});

export default function CatalogList({
  items,
  sections,
  shelvesBySection,
  genres,
  editable = true,
}: {
  items: Item[];
  sections: string[];
  shelvesBySection: Record<string, string[]>;
  genres: string[];
  editable?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(items);
  const [saved, setSaved] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The tier the bar will apply. Held in state and applied on a button rather
  // than written on change like the row control: firing on change is right for
  // one record and wrong for four hundred, where a stray arrow key on an open
  // select would be a real write across the whole selection.
  const [bulkVis, setBulkVis] = useState<Visibility>('public');

  // Clearing the selection whenever the displayed set changes is deliberate.
  // Filters and sort live in the parent, so a selection made under one filter
  // could otherwise survive into another and delete rows that are no longer on
  // screen. Nothing gets deleted that you cannot currently see.
  useEffect(() => {
    setRows(items);
    setSelected(new Set());
    setConfirming(false);
  }, [items]);

  // Ranges run over `rows` — the displayed order, after the parent's sort and
  // filter — not id order. Shift-click extends from the last row you clicked,
  // and takes its on/off sense from what the clicked row is becoming, so a
  // shift-click inside a selected run clears the run.
  //
  // `rows` and `anchor` are read through refs so this callback keeps one
  // identity for the life of the component. Passing a fresh function to 1,600
  // memoized rows on every render would defeat the memo entirely.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const anchorRef = useRef<number | null>(null);

  const pick = useCallback((id: number, shift: boolean) => {
    const list = rowsRef.current;
    const anchor = anchorRef.current;
    setSelected((prev) => {
      const next = new Set(prev);
      const turningOn = !prev.has(id);
      if (shift && anchor !== null) {
        const a = list.findIndex((r) => r.id === anchor);
        const b = list.findIndex((r) => r.id === id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) {
            if (turningOn) next.add(list[i].id);
            else next.delete(list[i].id);
          }
          return next;
        }
      }
      if (turningOn) next.add(id);
      else next.delete(id);
      return next;
    });
    anchorRef.current = id;
    setConfirming(false);
  }, []);

  function pickAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
    anchorRef.current = null;
    setConfirming(false);
  }

  const chosen = rows.filter((r) => selected.has(r.id));
  const withImages = chosen.filter((r) => (r.images && r.images.length > 0) || r.image).length;
  const withWriteup = chosen.filter((r) => !needsWriteup(r)).length;

  // Bulk visibility over the current selection — the same shift-click range the
  // delete action uses. One request, and one UPDATE per 200 ids on the server.
  //
  // The selection is deliberately KEPT afterwards, unlike delete. The rows are
  // still on screen and still yours to correct, and clearing after every set
  // would mean re-picking the range to fix a misclick.
  async function runVisibility(v: Visibility) {
    setBusy(true);
    setNote(null);
    const ids = [...selected];
    try {
      const res = await fetch('/api/items/bulk-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, visibility: v }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) {
        setNote(out?.error ? `Not changed — ${out.error}` : 'Not changed — the request failed.');
        return;
      }
      const touched = new Set(ids);
      setRows((rs) => rs.map((r) => (touched.has(r.id) ? { ...r, visibility: v } : r)));
      const updated = out?.updated ?? ids.length;
      setNote(
        `${updated} set to ${VISIBILITY_LABEL[v]}` +
          (updated !== ids.length ? ` · ${ids.length - updated} no longer exist` : '') +
          '.',
      );
    } catch {
      setNote('Not changed — the request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/items/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) {
        setNote(out?.error ? `Not deleted — ${out.error}` : 'Not deleted — the request failed.');
        return;
      }
      const gone = new Set<number>(out?.removed || []);
      setRows((rs) => rs.filter((r) => !gone.has(r.id)));
      setSelected(new Set());
      anchorRef.current = null;
      setConfirming(false);
      const missing = (out?.missing || []).length;
      setNote(
        `${gone.size} record${gone.size === 1 ? '' : 's'} deleted` +
          (missing ? ` · ${missing} were already gone` : '') +
          '.',
      );
    } catch {
      setNote('Not deleted — the request failed.');
    } finally {
      setBusy(false);
    }
  }

  const save = useCallback(async (id: number, patch: Patch) => {
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
  }, []);

  // The table body scrolls, not the window, so the parent's window.scrollY
  // save/restore has always been recording a number that never changes — which
  // is why coming back from an item page lands you at the top. This keeps the
  // container's own scrollTop in sessionStorage instead.
  const scrollBox = useRef<HTMLDivElement | null>(null);
  const SCROLL_KEY = 'vivarium.list.scroll';

  useEffect(() => {
    const box = scrollBox.current;
    if (!box) return;
    const saved = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    // Two frames: the first lays the rows out, the second has a scrollHeight
    // big enough to accept the position. Restoring on mount alone lands at 0.
    if (saved > 0) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (scrollBox.current) scrollBox.current.scrollTop = saved;
        }),
      );
    }
    let t: number | undefined;
    const onScroll = () => {
      if (t) return;
      t = window.setTimeout(() => {
        t = undefined;
        if (scrollBox.current) {
          sessionStorage.setItem(SCROLL_KEY, String(scrollBox.current.scrollTop));
        }
      }, 150);
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      box.removeEventListener('scroll', onScroll);
      if (t) window.clearTimeout(t);
    };
  }, []);

  const cell = editable
    ? 'rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-line focus:border-rust focus:bg-parchment'
    : 'bg-transparent px-1 py-0.5 text-ink';
  const sel = 'rounded border border-line bg-card px-1 py-0.5';
  // Column widths live in the <colgroup> below and the table is table-fixed, so
  // these sticky left offsets are exact rather than a guess at what auto layout
  // will do with them. Change a width there and change left-[…] here to match,
  // or the Title cell's opaque background starts covering the first characters
  // of every author name.
  const th = 'sticky top-0 z-20 bg-card px-2 py-2 font-medium';
  const thId = 'sticky top-0 left-0 z-30 bg-card px-2 py-2 font-medium';
  const thTitle = 'sticky top-0 left-[92px] z-30 border-r border-line bg-card px-2 py-2 font-medium';
  const tdId =
    'sticky left-0 z-10 whitespace-nowrap bg-parchment px-2 py-1.5 font-mono text-[11px] text-muted';
  const tdTitle = 'sticky left-[92px] z-10 border-r border-line bg-parchment px-2 py-1.5';

  // One object, kept stable, so it doesn't invalidate every memoized row on
  // every render.
  const classes = useMemo(
    () => ({ tdId, tdTitle, cell, sel }),
    [tdId, tdTitle, cell, sel],
  );

  return (
    <div>
      {/* The bar's height is reserved whenever the table is editable, so ticking
          the first checkbox doesn't insert an element above the table and shove
          every row down by about a row. That jump happened once per selection
          and never again, which is exactly the shape of a conditionally
          rendered element appearing. */}
      {editable && (
        <div className="mb-2 min-h-[2.5rem]">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-rust/40 bg-rust/5 px-3 py-2 text-sm">
              <span className="font-medium">{selected.size} selected</span>
              {!confirming ? (
                <>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted">Visibility:</span>
                    <VisSelect
                      value={bulkVis}
                      onChange={setBulkVis}
                      className="rounded border border-line bg-card px-1 py-1"
                    />
                    <button
                      onClick={() => runVisibility(bulkVis)}
                      disabled={busy}
                      title={VISIBILITY_HINT[bulkVis]}
                      className="rounded-md border border-line bg-card px-2 py-1 hover:border-rust disabled:opacity-50"
                    >
                      Apply to {selected.size}
                    </button>
                  </span>
                  <button
                    onClick={() => setConfirming(true)}
                    className="rounded-md border border-rust px-3 py-1 text-rust hover:bg-rust hover:text-white"
                  >
                    Delete…
                  </button>
                  <button
                    onClick={() => {
                      setSelected(new Set());
                      anchorRef.current = null;
                    }}
                    className="text-muted hover:text-rust"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <>
                  {/* The counts are the guard. A shift-click range is one gesture
                      and can overshoot, and the whole point of this pass is
                      deleting records that have neither images nor a write-up —
                      so anything in the selection that HAS one gets said out
                      loud first. */}
                  <span>
                    Delete {selected.size} record{selected.size === 1 ? '' : 's'} permanently?
                    {withImages > 0 && (
                      <strong className="text-rust"> {withImages} of them have images.</strong>
                    )}
                    {withWriteup > 0 && (
                      <strong className="text-rust"> {withWriteup} have a write-up.</strong>
                    )}
                    {withImages === 0 && withWriteup === 0 && ' None have images or a write-up.'}
                  </span>
                  <button
                    onClick={runDelete}
                    disabled={busy}
                    className="rounded-md bg-rust px-3 py-1 text-white disabled:opacity-50"
                  >
                    {busy ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="text-muted hover:text-rust"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {note && <p className="mb-2 text-xs text-moss">{note}</p>}

      <div
        ref={scrollBox}
        className="max-h-[calc(100vh-8rem)] overflow-auto rounded-lg border border-line"
      >
        <table className="w-full min-w-[1800px] table-fixed border-collapse text-sm">
          {/* Fixed layout with explicit widths. The three columns left without a
              width — Subjects, Notes, Cond. notes — absorb whatever the monitor
              has spare, which is where extra room is actually useful. */}
          <colgroup>
            <col className="w-[92px]" />
            <col className="w-[320px]" />
            <col className="w-[200px]" />
            <col className="w-[56px]" />
            <col className="w-[110px]" />
            <col className="w-[150px]" />
            <col className="w-[140px]" />
            <col className="w-[220px]" />
            <col />
            <col className="w-[120px]" />
            <col />
            <col className="w-[130px]" />
            <col />
          </colgroup>
          <thead>
            <tr className="text-left text-muted">
              <th className={thId}>
                {editable && (
                  <input
                    type="checkbox"
                    className="mr-1.5 align-middle"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={pickAll}
                    aria-label="select all shown"
                  />
                )}
                ID
              </th>
              <th className={thTitle}>Title</th>
              <th className={th}>Author</th>
              <th className={th}>Yr</th>
              <th className={th}>Visibility</th>
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
              <TableRow
                key={r.id}
                r={r}
                editable={editable}
                selected={selected.has(r.id)}
                isSaved={saved === r.id}
                sections={sections}
                shelvesBySection={shelvesBySection}
                classes={classes}
                save={save}
                pick={pick}
              />
            ))}
          </tbody>
        </table>
      </div>

      <datalist id="genreopts">{genres.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="locopts">
        {Array.from(new Set(rows.map((r) => r.location).filter(Boolean))).map((x) => (
          <option key={x as string} value={x as string} />
        ))}
      </datalist>
      {editable && (
        <p className="px-2 py-2 text-xs text-muted">
          Edit inline — changes save on change. Section, shelf, and condition are dropdowns from the
          managed vocabulary (shelf follows the section); genres and subjects are comma-separated.
          Visibility is Public (anyone through the site gate), Restricted (signed-in viewers) or
          Private (admins only); select rows and use the picker above to set a run at once.
        </p>
      )}
    </div>
  );
}
