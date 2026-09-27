'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { StudioArtist, StudioProject } from '@/lib/studioTypes';
import { RATING_MAX, todayCanonicalId } from '@/lib/studioTypes';
import { api, InlineEdit, Stars } from './controls';

// The studio's project list: create, rename, rate, set genre and BPM, filter.
//
// State is local and updated from each API response, so a change shows at once
// without re-fetching the whole list. The server sorts the same way on load.

function sortProjects(list: StudioProject[]): StudioProject[] {
  return [...list].sort((a, b) => {
    if (a.rating !== b.rating) return b.rating - a.rating;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export default function StudioProjects({
  initialProjects,
  artists,
  defaultArtistId,
}: {
  initialProjects: StudioProject[];
  artists: StudioArtist[];
  defaultArtistId: number | null;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState<number | ''>('');
  // 'any', 'unrated', or a minimum number of stars.
  const [ratingFilter, setRatingFilter] = useState<'any' | 'unrated' | number>('any');
  const [genreFilter, setGenreFilter] = useState('');
  const [error, setError] = useState('');

  const filtering = query.trim() !== '' || artistFilter !== '' || ratingFilter !== 'any' || genreFilter !== '';

  // The genre menu offers the genres in use, so it never lists an empty choice.
  const genres = useMemo(
    () => Array.from(new Set(projects.map((p) => p.genre).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [projects],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortProjects(projects).filter((p) => {
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
  }, [projects, query, artistFilter, ratingFilter, genreFilter]);

  function replace(p: StudioProject) {
    setProjects((list) => list.map((x) => (x.id === p.id ? p : x)));
  }

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
    <div>
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
        {filtering && (
          <span className="flex items-baseline gap-2 text-xs text-muted">
            showing {shown.length} of {projects.length}
            <button
              onClick={() => {
                setQuery('');
                setArtistFilter('');
                setRatingFilter('any');
                setGenreFilter('');
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
            <ProjectRow key={p.id} project={p} onRate={(n) => rate(p, n)} onPatch={(f) => patch(p, f)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectRow({
  project: p,
  onRate,
  onPatch,
}: {
  project: StudioProject;
  onRate: (rating: number) => void;
  onPatch: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap">
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

      <div className="w-32 shrink-0 text-muted">
        <InlineEdit value={p.genre} placeholder="genre" label="Genre" onSave={(v) => onPatch({ genre: v })} />
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
