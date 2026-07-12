'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Item } from '@/lib/types';
import CatalogList from './CatalogList';
import { sectionOf, isMaine } from '@/lib/sections';
import { imgUrl } from '@/lib/img';

function spineColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 30% 40%)`;
}

const SORTS = ['ID', 'Title', 'Author (last name)', 'Author within Genre', 'Year'] as const;
type Sort = (typeof SORTS)[number];
type View = 'cards' | 'shelf' | 'list';

const STORE_KEY = 'vivarium.browse.v1';
type Persisted = {
  q: string; type: string; genre: string; shelf: string; subject: string;
  place: string; section: string; view: View; sort: Sort; scrollY: number;
};
const DEFAULTS: Persisted = {
  q: '', type: 'All', genre: 'All', shelf: 'All', subject: 'All',
  place: 'All', section: 'All', view: 'cards', sort: 'ID', scrollY: 0,
};
function loadState(): Persisted {
  if (typeof window === 'undefined') return DEFAULTS;
  try { return { ...DEFAULTS, ...JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}') }; }
  catch { return DEFAULTS; }
}

function lastName(author: string): string {
  const cleaned = author.replace(/\(.*?\)/g, '').split(/[;/&]/)[0].trim();
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}
function titleKey(t: string): string {
  return t.replace(/^\s*(the|a|an)\s+/i, '').toLowerCase();
}

export default function Catalog({
  items,
  initialSection,
  initialQ,
  initialShelf,
  vocab,
  isAdmin = false,
}: {
  items: Item[];
  initialSection?: string;
  initialQ?: string;
  initialShelf?: string;
  vocab?: { sections: string[]; genres: string[]; shelves: string[]; shelvesBySection?: Record<string, string[]> };
  isAdmin?: boolean;
}) {
  // When arriving from a section click or the home search, the URL params drive a
  // fresh view; otherwise we restore the saved browse state (filters + scroll).
  const fromUrl = initialSection !== undefined || initialQ !== undefined || initialShelf !== undefined;

  const [q, setQ] = useState(DEFAULTS.q);
  const [type, setType] = useState(DEFAULTS.type);
  const [genre, setGenre] = useState(DEFAULTS.genre);
  const [shelf, setShelf] = useState(DEFAULTS.shelf);
  const [subject, setSubject] = useState(DEFAULTS.subject);
  const [place, setPlace] = useState(DEFAULTS.place);
  const [section, setSection] = useState(DEFAULTS.section);
  const [view, setView] = useState<View>(DEFAULTS.view);
  const [sort, setSort] = useState<Sort>(DEFAULTS.sort);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const s = loadState();
    if (fromUrl) {
      setQ(initialQ ?? '');
      setSection(initialSection ?? 'All');
      setType('All'); setGenre('All'); setShelf(initialShelf ?? 'All'); setSubject('All'); setPlace('All');
      setView(s.view); setSort(s.sort);
    } else {
      setQ(s.q); setSection(s.section); setType(s.type); setGenre(s.genre);
      setShelf(s.shelf); setSubject(s.subject); setPlace(s.place); setView(s.view); setSort(s.sort);
    }
    setHydrated(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = (vals: string[]) => ['All', ...Array.from(new Set(vals.filter(Boolean))).sort()];
  const types = useMemo(() => opts(items.map((i) => i.itemType)), [items]);
  const genres = useMemo(() => opts(items.flatMap((i) => i.genres)), [items]);
  const shelves = useMemo(() => opts(items.map((i) => i.shelf)), [items]);
  const subjects = useMemo(() => opts(items.flatMap((i) => i.subjects)), [items]);
  const places = useMemo(() => opts(items.flatMap((i) => i.places)), [items]);
  const sections = useMemo(() => {
    const list = ['All', ...Array.from(new Set(items.map(sectionOf))).sort()];
    if (items.some(isMaine)) list.push('Maine');
    return list;
  }, [items]);

  const filtered = useMemo(() => {
    const out = items.filter((i) => {
      if (q) {
        const hay =
          `${i.title} ${i.author} ${i.publisher} ${i.genres.join(' ')} ${i.subjects.join(' ')} ${i.places.join(' ')} ${i.description ?? ''} ${i.blurb ?? ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (section !== 'All') {
        if (section === 'Maine') { if (!isMaine(i)) return false; }
        else if (sectionOf(i) !== section) return false;
      }
      if (type !== 'All' && i.itemType !== type) return false;
      if (genre !== 'All' && !i.genres.includes(genre)) return false;
      if (shelf !== 'All' && i.shelf !== shelf) return false;
      if (subject !== 'All' && !i.subjects.includes(subject)) return false;
      if (place !== 'All' && !i.places.includes(place)) return false;
      return true;
    });
    const cmp: Record<Sort, (a: Item, b: Item) => number> = {
      ID: (a, b) => a.id - b.id,
      Title: (a, b) => titleKey(a.title).localeCompare(titleKey(b.title)),
      'Author (last name)': (a, b) =>
        lastName(a.author).localeCompare(lastName(b.author)) ||
        titleKey(a.title).localeCompare(titleKey(b.title)),
      'Author within Genre': (a, b) =>
        (a.shelf || a.genres[0] || '').localeCompare(b.shelf || b.genres[0] || '') ||
        lastName(a.author).localeCompare(lastName(b.author)),
      Year: (a, b) => (a.year || '').localeCompare(b.year || ''),
    };
    return [...out].sort(cmp[sort]);
  }, [items, q, section, type, genre, shelf, subject, place, sort]);

  useEffect(() => {
    if (!hydrated) return;
    const prev = loadState();
    sessionStorage.setItem(
      STORE_KEY,
      JSON.stringify({ ...prev, q, type, genre, shelf, subject, place, section, view, sort }),
    );
  }, [hydrated, q, type, genre, shelf, subject, place, section, view, sort]);

  // Record the current ordered set so item pages can offer prev/next through it.
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(
        'vivarium.browse.seq',
        JSON.stringify(filtered.map((i) => ({ i: i.id, t: i.title }))),
      );
    } catch {
      /* ignore quota errors */
    }
  }, [hydrated, filtered]);

  useEffect(() => {
    const y = fromUrl ? 0 : loadState().scrollY;
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
    let t: number | undefined;
    const onScroll = () => {
      if (t) return;
      t = window.setTimeout(() => {
        t = undefined;
        const prev = loadState();
        sessionStorage.setItem(STORE_KEY, JSON.stringify({ ...prev, scrollY: window.scrollY }));
      }, 150);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function reset() {
    setQ(''); setType('All'); setGenre('All'); setShelf('All');
    setSubject('All'); setPlace('All'); setSection('All'); setSort('ID');
  }
  const activeCount =
    (q ? 1 : 0) + [type, genre, shelf, subject, place, section].filter((v) => v !== 'All').length;

  const vbtn = (v: View, label: string) => (
    <button
      onClick={() => setView(v)}
      className={`rounded-md border px-2.5 py-1 text-sm transition ${view === v ? 'border-rust bg-rust text-white' : 'border-line bg-card hover:border-rust'}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* sticky toolbar — always reachable without scrolling to the top */}
      <div className="sticky top-0 z-30 -mx-4 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-parchment/90 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
        <button
          onClick={() => setMenuOpen(true)}
          className="flex items-center gap-2 rounded-md border border-line bg-card px-3 py-1.5 text-sm hover:border-rust"
        >
          <span aria-hidden>☰</span> Search &amp; filter
          {activeCount > 0 && (
            <span className="rounded-full bg-rust px-1.5 text-xs text-white">{activeCount}</span>
          )}
        </button>
        <span className="flex items-center gap-2 text-sm text-muted">
          {section !== 'All' && (
            <span className="rounded bg-card px-2 py-0.5 text-rust">{section}</span>
          )}
          {filtered.length} of {items.length}
        </span>
        <div className="ml-auto flex gap-2">
          {vbtn('cards', 'Cards')}
          {vbtn('shelf', 'Shelf')}
          {vbtn('list', 'List')}
        </div>
      </div>

      {/* slide-out menu holding all controls */}
      {menuOpen && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col gap-3 overflow-y-auto border-l border-line bg-parchment p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg">Search &amp; filter</h2>
              <button onClick={() => setMenuOpen(false)} className="text-muted hover:text-rust" aria-label="close">✕</button>
            </div>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, author, subject, description…"
              className="rounded-md border border-line bg-card px-3 py-2 outline-none focus:border-rust"
            />
            <Select label="Section" value={section} onChange={setSection} options={sections} />
            <Select label="Sort by" value={sort} onChange={(v) => setSort(v as Sort)} options={[...SORTS]} />
            <Select label="Genre" value={genre} onChange={setGenre} options={genres} />
            <Select label="Shelf" value={shelf} onChange={setShelf} options={shelves} />
            <Select label="Type" value={type} onChange={setType} options={types} />
            <Select label="Subject" value={subject} onChange={setSubject} options={subjects} />
            <Select label="Place" value={place} onChange={setPlace} options={places} />
            <div className="mt-2 flex gap-2">
              <button onClick={() => setMenuOpen(false)} className="flex-1 rounded-md bg-rust px-3 py-2 text-sm text-white">
                Show {filtered.length}
              </button>
              <button onClick={reset} className="rounded-md border border-line px-3 py-2 text-sm hover:border-rust">
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'list' ? (
        <CatalogList
          items={filtered}
          sections={vocab?.sections ?? []}
          shelvesBySection={vocab?.shelvesBySection ?? {}}
          genres={vocab?.genres ?? genres.slice(1)}
          editable={isAdmin}
        />
      ) : view === 'cards' ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <li key={i.id}>
              <Link
                href={`/items/${i.id}`}
                className="relative block h-full overflow-hidden rounded-lg border border-line bg-card p-4 transition hover:border-rust hover:shadow-sm"
              >
                {(!i.description?.trim() ||
                  !i.discussion?.trim() ||
                  i.discussion.trim().startsWith('**Needs review**')) && (
                  <span
                    aria-hidden
                    title="Write-up incomplete"
                    className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[20px] border-t-[20px] border-l-transparent border-t-amber-400"
                  />
                )}
                {i.image && (
                  <div className="mb-3 flex h-44 items-center justify-center overflow-hidden rounded bg-parchment">
                    <img src={imgUrl(i.image, true)} alt="" loading="lazy" className="max-h-44 w-auto object-contain" />
                  </div>
                )}
                <p className="font-mono text-[10px] text-muted">#{String(i.id).padStart(6, '0')}</p>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-serif text-lg leading-snug">{i.title}</h3>
                  {(i.signed || i.visibility === 'restricted') && (
                    <span className="flex shrink-0 gap-1">
                      {i.signed && (
                        <span className="rounded-full bg-rust/10 px-2 py-0.5 text-xs text-rust">signed</span>
                      )}
                      {i.visibility === 'restricted' && (
                        <span className="rounded-full bg-moss/10 px-2 py-0.5 text-xs text-moss" title="Private">🔒</span>
                      )}
                    </span>
                  )}
                </div>
                {i.author && <p className="mt-1 text-sm text-muted">{i.author}</p>}
                <p className="mt-1 text-xs text-muted">{[i.publisher, i.year].filter(Boolean).join(' · ')}</p>
                <div className="mt-3 text-xs">
                  <span className="text-rust">{sectionOf(i)}</span>
                  {i.shelf && <span className="text-muted">: {i.shelf}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-end gap-[3px] rounded-lg border border-line bg-gradient-to-b from-card to-parchment p-4">
          {filtered.map((i) => {
            const h = 150 + (i.title.length % 7) * 10;
            return (
              <Link
                key={i.id}
                href={`/items/${i.id}`}
                title={`${i.title}${i.author ? ' — ' + i.author : ''}`}
                className="group flex w-8 items-center justify-center rounded-sm shadow-sm transition hover:-translate-y-1"
                style={{ height: h, background: spineColor(i.genres[0] || i.itemType) }}
              >
                <span className="spine-title max-h-[92%] overflow-hidden px-0.5 py-1 text-[10px] font-medium text-white/95">
                  {i.title}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-card px-2 py-2 outline-none focus:border-rust"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
