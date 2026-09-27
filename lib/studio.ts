import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { getViewer } from './auth';
import { isStudioMember } from './studioAccess';
import type { StudioArtist, StudioName, StudioProject, StudioTrack } from './studioTypes';

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
  genre: string;
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

/** Highest rated first, then newest. */
export async function listProjects(): Promise<StudioProject[]> {
  const { data, error } = await db()
    .from('studio_projects')
    .select(PROJECT_COLUMNS)
    .order('rating', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ProjectRow[]).map(toProject);
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

export type UpdateResult =
  | { ok: true; project: StudioProject }
  | { ok: false; reason: 'not-found' | 'taken' | 'no-artist' };

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
  if (patch.genre !== undefined && patch.genre !== current.genre) row.genre = patch.genre;
  if (patch.bpm !== undefined && patch.bpm !== current.bpm) row.bpm = patch.bpm;
  if (patch.artistId !== undefined && patch.artistId !== current.artist.id) row.artist_id = patch.artistId;
  if (Object.keys(row).length === 0) return { ok: true, project: current };

  const { data, error } = await db().from('studio_projects').update(row).eq('id', id).select(PROJECT_COLUMNS).single();
  if (error) {
    // Moving to an artist that already has this canonical ID.
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: 'taken' };
    if (error.code === FOREIGN_KEY_VIOLATION) return { ok: false, reason: 'no-artist' };
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
