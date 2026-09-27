'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioArtist, StudioProject } from '@/lib/studioTypes';
import { RATING_MAX, todayCanonicalId } from '@/lib/studioTypes';
import { api, GenreSelect, InlineEdit, Stars } from './controls';
import PlayerBar from './PlayerBar';

// The studio's project list and audition room: create, rename, rate, set genre
// and BPM, sort, filter, and play each project's newest mix through one shared
// player that steps through the list as it is currently sorted and filtered.
//
// State is local and updated from each API response, so a change shows at once
// without re-fetching the whole list.

const SORTS = {
  rating: 'Rating',
  newest: 'Newest session',
  oldest: 'Oldest session',
  recent: 'Latest upload',
  name: 'Working name',
  bpm: 'BPM',
} as const;
type SortKey = keyof typeof SORTS;

function sortProjects(list: StudioProject[], by: SortKey): StudioProject[] {
  const newest = (a: StudioProject, b: StudioProject) => b.createdAt.localeCompare(a.createdAt);
  return [...list].sort((a, b) => {
    switch (by) {
      case 'rating':
        return b.rating - a.rating || newest(a, b);
      case 'newest':
        return newest(a, b);
      case 'oldest':
        return -newest(a, b);
      case 'recent': {
        // Projects with audio first, most recent upload on top; then the rest by session date.
        const ua = a.latest?.uploadedAt ?? '';
        const ub = b.latest?.uploadedAt ?? '';
        return ub.localeCompare(ua) || newest(a, b);
      }
      case 'name':
        return (a.workingName || '~').localeCompare(b.workingName || '~', undefined, { sensitivity: 'base' });
      case 'bpm':
        // Slowest first; projects with no BPM last.
        return (a.bpm ?? Infinity) - (b.bpm ?? Infinity) || newest(a, b);
    }
  });
}

function audioSrc(p: StudioProject): string | null {
  return p.latest ? `/api/studio/tracks/${p.latest.trackId}/audio` : null;
}

/** Keys typed into a field belong to the field, not the player. */
function typingInField(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export default function StudioProjects({
  initialProjects,
  artists,
  initialGenres,
  defaultArtistId,
}: {
  initialProjects: StudioProject[];
  artists: StudioArtist[];
  initialGenres: string[];
  defaultArtistId: number | null;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [genres, setGenres] = useState(initialGenres);
  const [query, setQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState<number | ''>('');
  // 'any', 'unrated', or a minimum number of stars.
  const [ratingFilter, setRatingFilter] = useState<'any' | 'unrated' | number>('any');
  const [genreFilter, setGenreFilter] = useState('');
  const [audioOnly, setAudioOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('rating');
  const [error, setError] = useState('');

  const filtering =
    query.trim() !== '' || artistFilter !== '' || ratingFilter !== 'any' || genreFilter !== '' || audioOnly;


  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortProjects(projects, sortBy).filter((p) => {
      if (audioOnly && !p.latest) return false;
      if (artistFilter !== '' && p.artist.id !== artistFilter) return false;
      if (ratingFilter === 'unrated' && p.rating !== 0) return false;
      if (typeof ratingFilter === 'number' && p.rating < ratingFilter) return false;
      if (genreFilter && p.genre !== genreFilter) return false;
      if (q) {
        const hay = `${p.canonicalId} ${p.workingName} ${p.genre} ${p.artist.code} ${p.artist.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, query, artistFilter, ratingFilter, genreFilter, audioOnly, sortBy]);

  // API responses about one project carry no `latest`; keep the one we have.
  function replace(p: StudioProject) {
    setProjects((list) => list.map((x) => (x.id === p.id ? { ...p, latest: p.latest ?? x.latest } : x)));
  }

  // ── Player ────────────────────────────────────────────────────────────────
  const audio = useRef<HTMLAudioElement>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const current = projects.find((p) => p.id === currentId) ?? null;

  const start = useCallback((p: StudioProject) => {
    const el = audio.current;
    const src = audioSrc(p);
    if (!el || !src) return;
    setCurrentId(p.id);
    setTime(0);
    setDuration(p.latest?.durationS ?? 0);
    el.src = src;
    el.play().catch(() => setPlaying(false));
  }, []);

  const toggle = useCallback(
    (p?: StudioProject) => {
      const el = audio.current;
      if (!el) return;
      if (p && p.id !== currentId) return start(p);
      if (currentId === null) {
        const first = shown.find((x) => x.latest);
        if (first) start(first);
        return;
      }
      if (el.paused) el.play().catch(() => setPlaying(false));
      else el.pause();
    },
    [currentId, shown, start],
  );

  // Next and previous walk the list as it is shown, skipping projects with no audio.
  const step = useCallback(
    (dir: 1 | -1) => {
      const playable = shown.filter((p) => p.latest);
      if (!playable.length) return;
      const i = playable.findIndex((p) => p.id === currentId);
      const next = i < 0 ? playable[0] : playable[(i + dir + playable.length) % playable.length];
      start(next);
    },
    [shown, currentId, start],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (typingInField(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        // Leave Space to scroll the page when there is nothing to play.
        if (currentId === null && !shown.some((p) => p.latest)) return;
        e.preventDefault();
        toggle();
      } else if (e.key === 'n' || e.key === 'N') step(1);
      else if (e.key === 'p' || e.key === 'P') step(-1);
      else if (current && /^[0-5]$/.test(e.key)) rate(current, Number(e.key));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // rate is recreated each render but only reads its arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggle, step, current, currentId, shown]);

  async function rate(p: StudioProject, rating: number) {
    setError('');
    replace({ ...p, rating }); // optimistic
    const r = await api<{ project: StudioProject }>(`/api/studio/projects/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ rating }),
    });
    if (r.ok) replace(r.data.project);
    else {
      replace(p);
      setError(r.body.error || 'Could not save the rating.');
    }
  }

  async function addGenre(name: string): Promise<string | null> {
    setError('');
    const r = await api<{ name: string; genres: string[] }>('/api/studio/genres', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!r.ok) {
      setError(r.body.error || 'Could not add the genre.');
      return null;
    }
    setGenres(r.data.genres);
    return r.data.name;
  }

  async function patch(p: StudioProject, fields: Record<string, unknown>): Promise<boolean> {
    setError('');
    const r = await api<{ project: StudioProject }>(`/api/studio/projects/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
    if (r.ok) {
      replace(r.data.project);
      return true;
    }
    setError(r.body.error || 'Could not save the change.');
    return false;
  }

  return (
    <div className={current ? 'pb-28' : undefined}>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onEnded={() => (autoAdvance ? step(1) : setPlaying(false))}
      />
      <NewProject
        artists={artists}
        defaultArtistId={defaultArtistId}
        onCreated={(p) => setProjects((list) => [p, ...list])}
      />

      <div className="mb-3 mt-6 flex flex-wrap items-center gap-4 text-sm">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ID, name or artist…"
          className="w-full rounded-md border border-line bg-card px-3 py-1.5 outline-none focus:border-rust sm:w-64"
        />
        <label className="flex items-center gap-2">
          <span className="text-muted">Artist</span>
          <select
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded-md border border-line bg-card px-2 py-1 outline-none focus:border-rust"
          >
            <option value="">All</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">Rating</span>
          <select
            value={String(ratingFilter)}
            onChange={(e) => {
              const v = e.target.value;
              setRatingFilter(v === 'any' || v === 'unrated' ? v : Number(v));
            }}
            className="rounded-md border border-line bg-card px-2 py-1 outline-none focus:border-rust"
          >
            <option value="any">Any</option>
            {Array.from({ length: RATING_MAX }, (_, i) => RATING_MAX - i).map((n) => (
              <option key={n} value={n}>
                {'★'.repeat(n)}
                {n < RATING_MAX ? ' and up' : ''}
              </option>
            ))}
            <option value="unrated">Unrated</option>
          </select>
        </label>
        {genres.length > 0 && (
          <label className="flex items-center gap-2">
            <span className="text-muted">Genre</span>
            <select
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              className="rounded-md border border-line bg-card px-2 py-1 outline-none focus:border-rust"
            >
              <option value="">All</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} />
          <span className="text-muted">With audio</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-md border border-line bg-card px-2 py-1 outline-none focus:border-rust"
          >
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k]}
              </option>
            ))}
          </select>
        </label>
        {filtering && (
          <span className="flex items-baseline gap-2 text-xs text-muted">
            showing {shown.length} of {projects.length}
            <button
              onClick={() => {
                setQuery('');
                setArtistFilter('');
                setRatingFilter('any');
                setGenreFilter('');
                setAudioOnly(false);
              }}
              className="underline hover:text-ink"
            >
              clear
            </button>
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-rust">{error}</p>}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-line bg-card px-4 py-6 text-sm text-muted">
          {projects.length === 0 ? 'No projects yet.' : 'No projects match these filters.'}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {shown.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              isCurrent={p.id === currentId}
              playing={p.id === currentId && playing}
              onPlay={() => toggle(p)}
              genres={genres}
              onAddGenre={addGenre}
              onRate={(n) => rate(p, n)}
              onPatch={(f) => patch(p, f)}
            />
          ))}
        </ul>
      )}

      {current && (
        <PlayerBar
          project={current}
          playing={playing}
          time={time}
          duration={duration}
          autoAdvance={autoAdvance}
          onToggle={() => toggle()}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onSeek={(t) => {
            if (audio.current) audio.current.currentTime = t;
            setTime(t);
          }}
          onRate={(n) => rate(current, n)}
          onAutoAdvance={setAutoAdvance}
        />
      )}

      {shown.some((p) => p.latest) && (
        <p className="mt-3 text-xs text-muted">
          Keys: Space play/pause · N next · P previous · 1–5 rate the playing project · 0 clears
        </p>
      )}
    </div>
  );
}

function ProjectRow({
  project: p,
  isCurrent,
  playing,
  onPlay,
  genres,
  onAddGenre,
  onRate,
  onPatch,
}: {
  project: StudioProject;
  isCurrent: boolean;
  playing: boolean;
  onPlay: () => void;
  genres: string[];
  onAddGenre: (name: string) => Promise<string | null>;
  onRate: (rating: number) => void;
  onPatch: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap ${isCurrent ? 'bg-ink/5' : ''}`}
    >
      {p.latest ? (
        <button
          onClick={onPlay}
          aria-label={playing ? 'Pause' : `Play v${p.latest.version}`}
          title={`${playing ? 'Pause' : 'Play'} v${p.latest.version}${p.latest.count > 1 ? ` (of ${p.latest.count})` : ''}`}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
            isCurrent ? 'border-ink bg-ink text-parchment' : 'border-line hover:border-ink'
          }`}
        >
          {playing ? '❚❚' : '▶'}
        </button>
      ) : (
        <span className="h-7 w-7 shrink-0" title="No reference track yet" />
      )}

      <Stars rating={p.rating} onRate={onRate} />

      <span className="w-10 shrink-0 text-xs font-medium tracking-[0.04em] text-muted" title={p.artist.name}>
        {p.artist.code}
      </span>

      <Link
        href={`/studio/${p.id}`}
        className="w-28 shrink-0 font-mono text-sm underline decoration-muted/50 underline-offset-4 hover:decoration-ink"
        title="Open the project — canonical ID matches the Ableton folder; permanent"
      >
        {p.canonicalId}
      </Link>

      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <InlineEdit
          value={p.workingName}
          placeholder="untitled"
          label="Working name"
          onSave={(v) => onPatch({ workingName: v })}
        />
      </div>

      <div className="w-36 shrink-0 text-muted">
        <GenreSelect
          value={p.genre}
          genres={genres}
          onAddGenre={onAddGenre}
          onChange={(g) => onPatch({ genre: g })}
          className="w-full border-transparent bg-transparent hover:border-line"
        />
      </div>

      <div className="w-16 shrink-0 text-right tabular-nums text-muted">
        <InlineEdit
          value={p.bpm === null ? '' : String(p.bpm)}
          placeholder="bpm"
          label="BPM"
          inputMode="decimal"
          align="right"
          onSave={(v) => onPatch({ bpm: v })}
        />
      </div>

      <span className="hidden w-24 shrink-0 text-right text-xs text-muted md:inline">
        {new Date(p.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
      </span>

      <Link
        href={`/studio/${p.id}`}
        className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:border-ink hover:text-ink"
        title="Open the project page: tracks, upload, download"
      >
        Open →
      </Link>
    </li>
  );
}

function NewProject({
  artists,
  defaultArtistId,
  onCreated,
}: {
  artists: StudioArtist[];
  defaultArtistId: number | null;
  onCreated: (p: StudioProject) => void;
}) {
  const [open, setOpen] = useState(false);
  const [artistId, setArtistId] = useState<number | ''>(defaultArtistId ?? '');
  const [canonicalId, setCanonicalId] = useState('');
  const [workingName, setWorkingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);

  function start() {
    // Today's date is taken when the form opens, in the viewer's own time zone,
    // rather than at render, where the server's clock (UTC) would decide it.
    setCanonicalId(todayCanonicalId());
    setWorkingName('');
    setError('');
    setSuggestion(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuggestion(null);
    const r = await api<{ project: StudioProject }>('/api/studio/projects', {
      method: 'POST',
      body: JSON.stringify({ artistId: artistId === '' ? null : artistId, canonicalId, workingName }),
    });
    setBusy(false);
    if (r.ok) {
      onCreated(r.data.project);
      setOpen(false);
      return;
    }
    setError(r.body.error || 'Could not create the project.');
    if (r.status === 409 && r.body.suggestion) setSuggestion(r.body.suggestion);
  }

  if (!open) {
    return (
      <button onClick={start} className="rounded-md bg-rust px-4 py-2 text-sm text-white">
        New project
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Artist</span>
          <select
            required
            value={artistId}
            onChange={(e) => setArtistId(e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded-md border border-line bg-parchment px-2 py-2 outline-none focus:border-rust"
          >
            <option value="" disabled>
              Choose…
            </option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Canonical ID</span>
          <input
            required
            value={canonicalId}
            onChange={(e) => setCanonicalId(e.target.value)}
            className="w-36 rounded-md border border-line bg-parchment px-2 py-2 font-mono outline-none focus:border-rust"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Working name</span>
          <input
            value={workingName}
            onChange={(e) => setWorkingName(e.target.value)}
            placeholder="optional"
            className="rounded-md border border-line bg-parchment px-2 py-2 outline-none focus:border-rust"
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-muted">
        The canonical ID must match the project&rsquo;s Ableton folder name. It cannot be changed after the project is
        created.
      </p>

      {error && (
        <p className="mt-3 text-sm text-rust">
          {error}{' '}
          {suggestion && (
            <button
              type="button"
              onClick={() => {
                setCanonicalId(suggestion);
                setError('');
                setSuggestion(null);
              }}
              className="underline"
            >
              Use “{suggestion}”
            </button>
          )}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button disabled={busy} className="rounded-md bg-rust px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Creating…' : 'Create project'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
