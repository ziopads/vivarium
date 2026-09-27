'use client';

import { useMemo, useRef, useState } from 'react';
import type { StudioArtist, StudioProject } from '@/lib/studioTypes';
import { todayCanonicalId } from '@/lib/studioTypes';

// The studio's project list: create, rename, star, filter.
//
// State is local and updated from each API response, so a change shows at once
// without re-fetching the whole list. The server sorts the same way on load.

function sortProjects(list: StudioProject[]): StudioProject[] {
  return [...list].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

async function api<T>(url: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; body: any }> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data: body as T } : { ok: false, status: res.status, body };
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
  const [artistFilter, setArtistFilter] = useState<number | ''>('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [error, setError] = useState('');

  const shown = useMemo(
    () =>
      sortProjects(projects).filter(
        (p) => (artistFilter === '' || p.artist.id === artistFilter) && (!starredOnly || p.starred),
      ),
    [projects, artistFilter, starredOnly],
  );

  function replace(p: StudioProject) {
    setProjects((list) => list.map((x) => (x.id === p.id ? p : x)));
  }

  async function toggleStar(p: StudioProject) {
    setError('');
    replace({ ...p, starred: !p.starred }); // optimistic
    const r = await api<{ project: StudioProject }>(`/api/studio/projects/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ starred: !p.starred }),
    });
    if (r.ok) replace(r.data.project);
    else {
      replace(p);
      setError(r.body.error || 'Could not update the star.');
    }
  }

  async function rename(p: StudioProject, workingName: string): Promise<boolean> {
    setError('');
    const r = await api<{ project: StudioProject }>(`/api/studio/projects/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ workingName }),
    });
    if (r.ok) {
      replace(r.data.project);
      return true;
    }
    setError(r.body.error || 'Could not rename the project.');
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
          <input type="checkbox" checked={starredOnly} onChange={(e) => setStarredOnly(e.target.checked)} />
          <span className="text-muted">Starred only</span>
        </label>
        {shown.length !== projects.length && (
          <span className="text-xs text-muted">
            showing {shown.length} of {projects.length}
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
            <ProjectRow key={p.id} project={p} onStar={() => toggleStar(p)} onRename={(n) => rename(p, n)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectRow({
  project: p,
  onStar,
  onRename,
}: {
  project: StudioProject;
  onStar: () => void;
  onRename: (name: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.workingName);
  const [saving, setSaving] = useState(false);
  // Escape cancels, and the blur that follows must not then save.
  const cancelled = useRef(false);

  async function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim();
    if (next === p.workingName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onRename(next);
    setSaving(false);
    if (ok) setEditing(false);
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={onStar}
        title={p.starred ? 'Unstar' : 'Star as a priority'}
        aria-label={p.starred ? 'Unstar' : 'Star'}
        aria-pressed={p.starred}
        className={`w-5 shrink-0 text-lg leading-none ${p.starred ? 'text-ink' : 'text-muted/50 hover:text-ink'}`}
      >
        {p.starred ? '★' : '☆'}
      </button>

      <span className="w-10 shrink-0 text-xs font-medium tracking-[0.04em] text-muted" title={p.artist.name}>
        {p.artist.code}
      </span>

      <span className="w-28 shrink-0 font-mono text-sm" title="Canonical ID — matches the Ableton folder; permanent">
        {p.canonicalId}
      </span>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                cancelled.current = true;
                setDraft(p.workingName);
                setEditing(false);
              }
            }}
            placeholder="Working name"
            className="w-full rounded-md border border-line bg-parchment px-2 py-1 text-sm outline-none focus:border-rust"
          />
        ) : (
          <button
            onClick={() => {
              // Browsers disagree on whether removing a focused input fires blur,
              // so the Escape flag may never have been consumed. Clear it here.
              cancelled.current = false;
              setDraft(p.workingName);
              setEditing(true);
            }}
            title="Rename"
            className="block w-full truncate text-left text-sm hover:text-rust"
          >
            {p.workingName || <span className="text-muted">untitled</span>}
          </button>
        )}
      </div>

      <span className="hidden shrink-0 text-xs text-muted sm:inline">
        {new Date(p.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
      </span>
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
