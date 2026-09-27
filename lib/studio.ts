import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { getViewer } from './auth';
import { isStudioMember } from './studioAccess';
import type { StudioArtist, StudioProject } from './studioTypes';

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
  'id, canonical_id, working_name, starred, created_by, created_at, artist:studio_artists(id, code, name)';

type ProjectRow = {
  id: number;
  canonical_id: string;
  working_name: string;
  starred: boolean;
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
    starred: r.starred,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/** Starred first, then newest. */
export async function listProjects(): Promise<StudioProject[]> {
  const { data, error } = await db()
    .from('studio_projects')
    .select(PROJECT_COLUMNS)
    .order('starred', { ascending: false })
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
 * Rename, star, or move to another artist. The canonical ID is not a parameter:
 * nothing in the app can change it, and the database trigger refuses it anyway.
 */
export async function updateProject(
  id: number,
  patch: { workingName?: string; starred?: boolean; artistId?: number },
  by: string,
): Promise<UpdateResult> {
  const current = await getProject(id);
  if (!current) return { ok: false, reason: 'not-found' };

  const row: Record<string, unknown> = {};
  if (patch.workingName !== undefined && patch.workingName !== current.workingName) row.working_name = patch.workingName;
  if (patch.starred !== undefined) row.starred = patch.starred;
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
