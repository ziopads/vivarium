import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { getViewer } from './auth';
import { isStudioMember } from './studioAccess';
import type { LatestTrack, ReleaseKind, StudioArtist, StudioName, StudioNote, StudioProject, StudioRelease, StudioTrack } from './studioTypes';

// Server-only studio data layer: the studio_* tables (supabase/schema.sql).
//
// Unlike the catalogue, which reads every item and writes them all back
// (lib/data.ts), the studio reads and writes single rows. And unlike the
// catalogue, it has no local-JSON mode: without Supabase there is no studio,
// and middleware answers 503 before any of this runs.

function db(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error('The studio needs Supabase configured.');
  return client;
}

/** The signed-in studio member, or null. Same rule as middleware. */
export async function getStudioViewer(): Promise<{ email: string } | null> {
  const viewer = await getViewer();
  if (!viewer.email || !isStudioMember(viewer.email)) return null;
  return { email: viewer.email.toLowerCase() };
}

// ── Artists and members ──────────────────────────────────────────────────────

export async function listArtists(): Promise<StudioArtist[]> {
  const { data, error } = await db().from('studio_artists').select('id, code, name').order('code');
  if (error) throw error;
  return (data ?? []) as StudioArtist[];
}

/** The artist a member appears as, or null when they have no studio_members row. */
export async function getMemberArtistId(email: string): Promise<number | null> {
  const { data, error } = await db()
    .from('studio_members')
    .select('artist_id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.artist_id) : null;
}

// ── Projects ─────────────────────────────────────────────────────────────────

const PROJECT_COLUMNS =
  'id, canonical_id, working_name, rating, genre, bpm, created_by, created_at, artist:studio_artists(id, code, name)';

type ProjectRow = {
  id: number;
  canonical_id: string;
  working_name: string;
  rating: number;
  genre: string | null;
  // numeric arrives from PostgREST as a number or a string depending on size.
  bpm: number | string | null;
  created_by: string;
  created_at: string;
  // PostgREST embeds a to-one relation as an object; the untyped client's
  // inference says array. Accept either.
  artist: StudioArtist | StudioArtist[] | null;
};

function toProject(r: ProjectRow): StudioProject {
  const artist = Array.isArray(r.artist) ? r.artist[0] : r.artist;
  return {
    id: Number(r.id),
    artist: artist
      ? { id: Number(artist.id), code: artist.code, name: artist.name }
      : { id: 0, code: '?', name: 'Unknown artist' },
    canonicalId: r.canonical_id,
    workingName: r.working_name,
    rating: Number(r.rating),
    genre: r.genre ?? '',
    bpm: r.bpm === null || r.bpm === undefined ? null : Number(r.bpm),
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/** Highest rated first, then newest, each with its newest reference track. */
export async function listProjects(): Promise<StudioProject[]> {
  const [{ data, error }, latest, releases] = await Promise.all([
    db()
      .from('studio_projects')
      .select(PROJECT_COLUMNS)
      .order('rating', { ascending: false })
      .order('created_at', { ascending: false }),
    latestTracks(),
    releaseMembership(),
  ]);
  if (error) throw error;
  return ((data ?? []) as unknown as ProjectRow[]).map((r) => {
    const p = toProject(r);
    return { ...p, latest: latest.get(p.id) ?? null, releaseIds: releases.get(p.id) ?? [] };
  });
}

/**
 * projectId → its newest track and version count. One read of the small
 * columns of every track; at studio scale (hundreds, not millions) that is
 * cheaper and simpler than a per-project query or a view.
 */
async function latestTracks(): Promise<Map<number, LatestTrack>> {
  const { data, error } = await db()
    .from('studio_tracks')
    .select('id, project_id, version, duration_s, uploaded_at')
    .order('version', { ascending: false });
  if (error) throw error;
  const map = new Map<number, LatestTrack>();
  for (const r of data ?? []) {
    const pid = Number(r.project_id);
    const seen = map.get(pid);
    if (seen) seen.count += 1;
    else {
      map.set(pid, {
        trackId: Number(r.id),
        version: r.version as number,
        durationS: (r.duration_s as number | null) ?? null,
        uploadedAt: r.uploaded_at as string,
        count: 1,
      });
    }
  }
  return map;
}

export async function getProject(id: number): Promise<StudioProject | null> {
  const { data, error } = await db().from('studio_projects').select(PROJECT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toProject(data as unknown as ProjectRow) : null;
}

// Postgres error codes the routes turn into readable answers.
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * The first of `base`, `base`b, `base`c … that this artist has not used. One
 * query with an exact-match IN list, deliberately not a LIKE: a canonical ID
 * may contain `%` or `_`, and PostgREST LIKE patterns would need escaping.
 */
export async function suggestCanonicalId(artistId: number, base: string): Promise<string | null> {
  const candidates = [base, ...'bcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${base}${c}`)];
  const { data, error } = await db()
    .from('studio_projects')
    .select('canonical_id')
    .eq('artist_id', artistId)
    .in('canonical_id', candidates);
  if (error) throw error;
  const taken = new Set((data ?? []).map((r) => r.canonical_id as string));
  return candidates.find((c) => !taken.has(c)) ?? null;
}

async function recordName(projectId: number, name: string, by: string): Promise<void> {
  if (!name) return;
  const { error } = await db().from('studio_project_names').insert({ project_id: projectId, name, set_by: by });
  // History is secondary to the rename itself, which has already succeeded, so
  // a failure here is logged rather than reported as a failed save.
  if (error) console.error('studio_project_names insert failed', error);
}

export type CreateResult =
  | { ok: true; project: StudioProject }
  | { ok: false; reason: 'taken'; suggestion: string | null }
  | { ok: false; reason: 'no-artist' };

export async function createProject(input: {
  artistId: number;
  canonicalId: string;
  workingName: string;
  by: string;
}): Promise<CreateResult> {
  const { data, error } = await db()
    .from('studio_projects')
    .insert({
      artist_id: input.artistId,
      canonical_id: input.canonicalId,
      working_name: input.workingName,
      created_by: input.by,
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: 'taken', suggestion: await suggestCanonicalId(input.artistId, input.canonicalId) };
    }
    if (error.code === FOREIGN_KEY_VIOLATION) return { ok: false, reason: 'no-artist' };
    throw error;
  }

  const project = toProject(data as unknown as ProjectRow);
  await recordName(project.id, project.workingName, input.by);
  return { ok: true, project };
}

/**
 * The same change to many sessions at once: genre, BPM, rating, artist. One
 * UPDATE, so it applies to all of them or none — moving several sessions to an
 * artist that already has one of their canonical IDs fails as a whole.
 * Working names are deliberately not bulk-editable: each rename belongs in its
 * session's name history.
 */
export async function bulkUpdateProjects(
  ids: number[],
  patch: { genre?: string; bpm?: number | null; rating?: number; artistId?: number },
): Promise<{ ok: true; projects: StudioProject[] } | { ok: false; reason: 'taken' | 'no-artist' | 'no-genre' }> {
  const row: Record<string, unknown> = {};
  if (patch.genre !== undefined) row.genre = patch.genre || null;
  if (patch.bpm !== undefined) row.bpm = patch.bpm;
  if (patch.rating !== undefined) row.rating = patch.rating;
  if (patch.artistId !== undefined) row.artist_id = patch.artistId;
  if (!ids.length || !Object.keys(row).length) return { ok: true, projects: [] };
  const { data, error } = await db().from('studio_projects').update(row).in('id', ids).select(PROJECT_COLUMNS);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: 'taken' };
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, reason: /genre/.test(error.message) ? 'no-genre' : 'no-artist' };
    }
    throw error;
  }
  return { ok: true, projects: ((data ?? []) as unknown as ProjectRow[]).map(toProject) };
}

export type UpdateResult =
  | { ok: true; project: StudioProject }
  | { ok: false; reason: 'not-found' | 'taken' | 'no-artist' | 'no-genre' };

/**
 * Rename, rate, set genre or BPM, or move to another artist. The canonical ID is not a parameter:
 * nothing in the app can change it, and the database trigger refuses it anyway.
 */
export async function updateProject(
  id: number,
  patch: { workingName?: string; rating?: number; genre?: string; bpm?: number | null; artistId?: number },
  by: string,
): Promise<UpdateResult> {
  const current = await getProject(id);
  if (!current) return { ok: false, reason: 'not-found' };

  const row: Record<string, unknown> = {};
  if (patch.workingName !== undefined && patch.workingName !== current.workingName) row.working_name = patch.workingName;
  if (patch.rating !== undefined && patch.rating !== current.rating) row.rating = patch.rating;
  // '' in the app is NULL in the table: the genre foreign key accepts NULL, not ''.
  if (patch.genre !== undefined && patch.genre !== current.genre) row.genre = patch.genre || null;
  if (patch.bpm !== undefined && patch.bpm !== current.bpm) row.bpm = patch.bpm;
  if (patch.artistId !== undefined && patch.artistId !== current.artist.id) row.artist_id = patch.artistId;
  if (Object.keys(row).length === 0) return { ok: true, project: current };

  const { data, error } = await db().from('studio_projects').update(row).eq('id', id).select(PROJECT_COLUMNS).single();
  if (error) {
    // Moving to an artist that already has this canonical ID.
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: 'taken' };
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, reason: /genre/.test(error.message) ? 'no-genre' : 'no-artist' };
    }
    throw error;
  }

  const project = toProject(data as unknown as ProjectRow);
  if ('working_name' in row) await recordName(id, project.workingName, by);
  return { ok: true, project };
}

// ── Members' codes ───────────────────────────────────────────────────────────

/** email → artist code, for showing "VIG" where a row stores an email. */
export async function memberCodes(): Promise<Map<string, string>> {
  const { data, error } = await db().from('studio_members').select('email, artist:studio_artists(code)');
  if (error) throw error;
  const map = new Map<string, string>();
  for (const r of (data ?? []) as unknown as { email: string; artist: { code: string } | { code: string }[] | null }[]) {
    const a = Array.isArray(r.artist) ? r.artist[0] : r.artist;
    if (a) map.set(r.email, a.code);
  }
  return map;
}

// ── Name history ─────────────────────────────────────────────────────────────

export async function listNames(projectId: number): Promise<StudioName[]> {
  const [{ data, error }, codes] = await Promise.all([
    db()
      .from('studio_project_names')
      .select('name, set_by, set_at')
      .eq('project_id', projectId)
      .order('set_at', { ascending: false })
      .order('id', { ascending: false }),
    memberCodes(),
  ]);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    name: r.name as string,
    setBy: r.set_by as string,
    setByCode: codes.get(r.set_by as string) ?? null,
    setAt: r.set_at as string,
  }));
}

// ── Reference tracks ─────────────────────────────────────────────────────────

const TRACK_COLUMNS = 'id, project_id, version, r2_key, original_filename, bytes, duration_s, uploaded_by, uploaded_at';

type TrackRow = {
  id: number;
  project_id: number;
  version: number;
  r2_key: string;
  original_filename: string;
  bytes: number | string | null;
  duration_s: number | null;
  uploaded_by: string;
  uploaded_at: string;
};

function toTrack(r: TrackRow, codes: Map<string, string>): StudioTrack {
  return {
    id: Number(r.id),
    projectId: Number(r.project_id),
    version: r.version,
    originalFilename: r.original_filename,
    bytes: r.bytes === null ? null : Number(r.bytes),
    durationS: r.duration_s,
    uploadedBy: r.uploaded_by,
    uploadedByCode: codes.get(r.uploaded_by) ?? null,
    uploadedAt: r.uploaded_at,
  };
}

/** Newest version first. */
export async function listTracks(projectId: number): Promise<StudioTrack[]> {
  const [{ data, error }, codes] = await Promise.all([
    db().from('studio_tracks').select(TRACK_COLUMNS).eq('project_id', projectId).order('version', { ascending: false }),
    memberCodes(),
  ]);
  if (error) throw error;
  return ((data ?? []) as TrackRow[]).map((r) => toTrack(r, codes));
}

/** A track with its storage key, for the routes that sign links. Never sent to the browser. */
export async function getTrackWithKey(id: number): Promise<{ track: StudioTrack; key: string } | null> {
  const { data, error } = await db().from('studio_tracks').select(TRACK_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as TrackRow;
  return { track: toTrack(row, await memberCodes()), key: row.r2_key };
}

/**
 * Record an uploaded MP3 as the project's next version. Two uploads finishing
 * at once can both read the same highest version; the unique (project_id,
 * version) constraint rejects the second, which then retries with a fresh read.
 */
export async function addTrack(input: {
  projectId: number;
  key: string;
  originalFilename: string;
  bytes: number;
  durationS: number | null;
  by: string;
}): Promise<StudioTrack> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: top, error: readError } = await db()
      .from('studio_tracks')
      .select('version')
      .eq('project_id', input.projectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    const version = (top ? Number(top.version) : 0) + 1;

    const { data, error } = await db()
      .from('studio_tracks')
      .insert({
        project_id: input.projectId,
        version,
        r2_key: input.key,
        original_filename: input.originalFilename,
        bytes: input.bytes,
        duration_s: input.durationS,
        uploaded_by: input.by,
      })
      .select(TRACK_COLUMNS)
      .single();
    if (!error) return toTrack(data as TrackRow, await memberCodes());
    // 23505 on (project_id, version): someone else took this number. On
    // r2_key it means this upload was already recorded, which is a bug.
    if (error.code !== UNIQUE_VIOLATION || /r2_key/.test(error.message)) throw error;
  }
  throw new Error('Could not assign a version number after several attempts.');
}

export async function deleteTrackRow(id: number): Promise<void> {
  const { error } = await db().from('studio_tracks').delete().eq('id', id);
  if (error) throw error;
}

// ── Genres ───────────────────────────────────────────────────────────────────

export async function listGenres(): Promise<string[]> {
  const { data, error } = await db().from('studio_genres').select('name').order('name');
  if (error) throw error;
  return (data ?? []).map((r) => r.name as string);
}

/**
 * Add a genre, or return the existing spelling when one matches regardless of
 * case, so "Techno" typed twice never becomes two entries.
 */
export async function addGenre(name: string): Promise<string> {
  const existing = (await listGenres()).find((g) => g.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const { error } = await db().from('studio_genres').insert({ name });
  if (error) {
    // Someone added it between the read and the insert.
    if (error.code === UNIQUE_VIOLATION) {
      const again = (await listGenres()).find((g) => g.toLowerCase() === name.toLowerCase());
      if (again) return again;
    }
    throw error;
  }
  return name;
}

// ── Notes ────────────────────────────────────────────────────────────────────

const NOTE_COLUMNS = 'id, project_id, track_id, author, body, created_at, edited_at, track:studio_tracks(version)';

type NoteRow = {
  id: number;
  project_id: number;
  track_id: number | null;
  author: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  track: { version: number } | { version: number }[] | null;
};

function toNote(r: NoteRow, codes: Map<string, string>): StudioNote {
  const t = Array.isArray(r.track) ? r.track[0] : r.track;
  return {
    id: Number(r.id),
    projectId: Number(r.project_id),
    trackId: r.track_id === null ? null : Number(r.track_id),
    trackVersion: t ? t.version : null,
    author: r.author,
    authorCode: codes.get(r.author) ?? null,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  };
}

/** Newest first. Filtering by person, date and version happens on the page. */
export async function listNotes(projectId: number): Promise<StudioNote[]> {
  const [{ data, error }, codes] = await Promise.all([
    db().from('studio_notes').select(NOTE_COLUMNS).eq('project_id', projectId).order('created_at', { ascending: false }),
    memberCodes(),
  ]);
  if (error) throw error;
  return ((data ?? []) as unknown as NoteRow[]).map((r) => toNote(r, codes));
}

export async function getNote(id: number): Promise<StudioNote | null> {
  const { data, error } = await db().from('studio_notes').select(NOTE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toNote(data as unknown as NoteRow, await memberCodes()) : null;
}

/** Does this track belong to this project? Guards a note from pointing across projects. */
async function trackInProject(trackId: number, projectId: number): Promise<boolean> {
  const { data, error } = await db().from('studio_tracks').select('project_id').eq('id', trackId).maybeSingle();
  if (error) throw error;
  return !!data && Number(data.project_id) === projectId;
}

export type NoteResult = { ok: true; note: StudioNote } | { ok: false; reason: 'bad-track' | 'not-found' };

export async function addNote(input: {
  projectId: number;
  trackId: number | null;
  body: string;
  by: string;
}): Promise<NoteResult> {
  if (input.trackId !== null && !(await trackInProject(input.trackId, input.projectId))) {
    return { ok: false, reason: 'bad-track' };
  }
  const { data, error } = await db()
    .from('studio_notes')
    .insert({ project_id: input.projectId, track_id: input.trackId, author: input.by, body: input.body })
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw error;
  return { ok: true, note: toNote(data as unknown as NoteRow, await memberCodes()) };
}

/** Edit the text or the version a note is about. The route decides who may. */
export async function updateNote(
  id: number,
  patch: { body?: string; trackId?: number | null },
): Promise<NoteResult> {
  const current = await getNote(id);
  if (!current) return { ok: false, reason: 'not-found' };
  if (patch.trackId !== undefined && patch.trackId !== null && !(await trackInProject(patch.trackId, current.projectId))) {
    return { ok: false, reason: 'bad-track' };
  }
  const row: Record<string, unknown> = {};
  if (patch.body !== undefined && patch.body !== current.body) row.body = patch.body;
  if (patch.trackId !== undefined && patch.trackId !== current.trackId) row.track_id = patch.trackId;
  if (Object.keys(row).length === 0) return { ok: true, note: current };
  // Only a change to the text counts as an edit worth showing.
  if ('body' in row) row.edited_at = new Date().toISOString();
  const { data, error } = await db().from('studio_notes').update(row).eq('id', id).select(NOTE_COLUMNS).single();
  if (error) throw error;
  return { ok: true, note: toNote(data as unknown as NoteRow, await memberCodes()) };
}

export async function deleteNote(id: number): Promise<void> {
  const { error } = await db().from('studio_notes').delete().eq('id', id);
  if (error) throw error;
}

// ── Releases ─────────────────────────────────────────────────────────────────

/** projectId → the ids of the releases it is on. */
async function releaseMembership(): Promise<Map<number, number[]>> {
  const { data, error } = await db().from('studio_release_tracks').select('release_id, project_id');
  if (error) throw error;
  const map = new Map<number, number[]>();
  for (const r of data ?? []) {
    const pid = Number(r.project_id);
    map.set(pid, [...(map.get(pid) ?? []), Number(r.release_id)]);
  }
  return map;
}

const RELEASE_COLUMNS = 'id, title, kind, year, notes, created_at, artist:studio_artists(id, code, name)';

type ReleaseRow = {
  id: number;
  title: string;
  kind: ReleaseKind;
  year: number | null;
  notes: string;
  created_at: string;
  artist: StudioArtist | StudioArtist[] | null;
};

function toRelease(r: ReleaseRow, count: number): StudioRelease {
  const a = Array.isArray(r.artist) ? r.artist[0] : r.artist;
  return {
    id: Number(r.id),
    title: r.title,
    kind: r.kind,
    artist: a ? { id: Number(a.id), code: a.code, name: a.name } : null,
    year: r.year,
    notes: r.notes ?? '',
    createdAt: r.created_at,
    trackCount: count,
  };
}

async function releaseCounts(): Promise<Map<number, number>> {
  const { data, error } = await db().from('studio_release_tracks').select('release_id');
  if (error) throw error;
  const map = new Map<number, number>();
  for (const r of data ?? []) map.set(Number(r.release_id), (map.get(Number(r.release_id)) ?? 0) + 1);
  return map;
}

/** Newest year first, then title. Releases with no year last. */
export async function listReleases(): Promise<StudioRelease[]> {
  const [{ data, error }, counts] = await Promise.all([
    db().from('studio_releases').select(RELEASE_COLUMNS).order('year', { ascending: false, nullsFirst: false }).order('title'),
    releaseCounts(),
  ]);
  if (error) throw error;
  return ((data ?? []) as unknown as ReleaseRow[]).map((r) => toRelease(r, counts.get(Number(r.id)) ?? 0));
}

export async function getRelease(id: number): Promise<StudioRelease | null> {
  const [{ data, error }, counts] = await Promise.all([
    db().from('studio_releases').select(RELEASE_COLUMNS).eq('id', id).maybeSingle(),
    releaseCounts(),
  ]);
  if (error) throw error;
  return data ? toRelease(data as unknown as ReleaseRow, counts.get(id) ?? 0) : null;
}

export async function createRelease(input: {
  title: string;
  kind: ReleaseKind;
  artistId: number | null;
  year: number | null;
  by: string;
}): Promise<StudioRelease> {
  const { data, error } = await db()
    .from('studio_releases')
    .insert({ title: input.title, kind: input.kind, artist_id: input.artistId, year: input.year, created_by: input.by })
    .select(RELEASE_COLUMNS)
    .single();
  if (error) throw error;
  return toRelease(data as unknown as ReleaseRow, 0);
}

export async function updateRelease(
  id: number,
  patch: { title?: string; kind?: ReleaseKind; artistId?: number | null; year?: number | null; notes?: string },
): Promise<StudioRelease | null> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.artistId !== undefined) row.artist_id = patch.artistId;
  if (patch.year !== undefined) row.year = patch.year;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (Object.keys(row).length) {
    const { error } = await db().from('studio_releases').update(row).eq('id', id);
    if (error) throw error;
  }
  return getRelease(id);
}

/** Removes the release and its running order. The sessions and their audio are untouched. */
export async function deleteRelease(id: number): Promise<void> {
  const { error } = await db().from('studio_releases').delete().eq('id', id);
  if (error) throw error;
}

/** The release's sessions in running order, each with its newest track. */
export async function releaseProjects(releaseId: number): Promise<StudioProject[]> {
  const [{ data, error }, all] = await Promise.all([
    db().from('studio_release_tracks').select('project_id, position').eq('release_id', releaseId).order('position'),
    listProjects(),
  ]);
  if (error) throw error;
  const byId = new Map(all.map((p) => [p.id, p]));
  return (data ?? []).map((r) => byId.get(Number(r.project_id))).filter((p): p is StudioProject => !!p);
}

/** Append sessions to the end of the running order; ones already on the release are skipped. */
export async function addToRelease(releaseId: number, projectIds: number[]): Promise<void> {
  const { data, error } = await db().from('studio_release_tracks').select('project_id, position').eq('release_id', releaseId);
  if (error) throw error;
  const present = new Set((data ?? []).map((r) => Number(r.project_id)));
  let pos = Math.max(0, ...(data ?? []).map((r) => Number(r.position)));
  const rows = Array.from(new Set(projectIds))
    .filter((id) => !present.has(id))
    .map((id) => ({ release_id: releaseId, project_id: id, position: ++pos }));
  if (!rows.length) return;
  const { error: insertError } = await db().from('studio_release_tracks').insert(rows);
  if (insertError) throw insertError;
}

/** Set the running order: positions 1..n in the order given. Ids not on the release are ignored. */
export async function reorderRelease(releaseId: number, projectIds: number[]): Promise<void> {
  const rows = projectIds.map((id, i) => ({ release_id: releaseId, project_id: id, position: i + 1 }));
  if (!rows.length) return;
  // Upsert on the (release_id, project_id) key rewrites positions in one request;
  // a pair that is not already on the release would be added, so filter first.
  const { data, error } = await db().from('studio_release_tracks').select('project_id').eq('release_id', releaseId);
  if (error) throw error;
  const present = new Set((data ?? []).map((r) => Number(r.project_id)));
  const { error: upsertError } = await db()
    .from('studio_release_tracks')
    .upsert(rows.filter((r) => present.has(r.project_id)), { onConflict: 'release_id,project_id' });
  if (upsertError) throw upsertError;
}

/** Take one session off a release, then close the gap in the running order. */
export async function removeFromRelease(releaseId: number, projectId: number): Promise<void> {
  const { error } = await db().from('studio_release_tracks').delete().eq('release_id', releaseId).eq('project_id', projectId);
  if (error) throw error;
  const { data, error: readError } = await db()
    .from('studio_release_tracks')
    .select('project_id')
    .eq('release_id', releaseId)
    .order('position');
  if (readError) throw readError;
  await reorderRelease(releaseId, (data ?? []).map((r) => Number(r.project_id)));
}

/** The releases one session is on, newest first. */
export async function releasesForProject(projectId: number): Promise<StudioRelease[]> {
  const { data, error } = await db().from('studio_release_tracks').select('release_id').eq('project_id', projectId);
  if (error) throw error;
  const ids = new Set((data ?? []).map((r) => Number(r.release_id)));
  if (!ids.size) return [];
  return (await listReleases()).filter((r) => ids.has(r.id));
}
