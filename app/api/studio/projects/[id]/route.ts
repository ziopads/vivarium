import { NextResponse } from 'next/server';
import { getProject, getStudioViewer, updateProject } from '@/lib/studio';
import { parseWorkingName } from '@/lib/studioTypes';

export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/studio/projects/:id
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await getStudioViewer();
  if (!viewer) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  return NextResponse.json({ project });
}

// PATCH /api/studio/projects/:id   { workingName?, starred?, artistId? }
// Any studio member. The canonical ID is permanent, so a body that tries to set
// it is refused outright rather than having that key quietly ignored.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getStudioViewer();
  if (!viewer) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if ('canonicalId' in body || 'canonical_id' in body) {
    return NextResponse.json(
      { error: 'The canonical ID is permanent: it matches the Ableton folder and cannot be changed.' },
      { status: 400 },
    );
  }

  const patch: { workingName?: string; starred?: boolean; artistId?: number } = {};
  if ('workingName' in body) {
    const name = parseWorkingName(body.workingName);
    if ('error' in name) return NextResponse.json({ error: name.error }, { status: 400 });
    patch.workingName = name.value;
  }
  if ('starred' in body) {
    if (typeof body.starred !== 'boolean') return NextResponse.json({ error: 'starred must be true or false' }, { status: 400 });
    patch.starred = body.starred;
  }
  if ('artistId' in body) {
    const artistId = Number(body.artistId);
    if (!Number.isInteger(artistId)) return NextResponse.json({ error: 'Invalid artist' }, { status: 400 });
    patch.artistId = artistId;
  }

  const result = await updateProject(id, patch, viewer.email);
  if (!result.ok) {
    if (result.reason === 'not-found') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (result.reason === 'no-artist') return NextResponse.json({ error: 'That artist is not on the roster.' }, { status: 400 });
    return NextResponse.json(
      { error: 'That artist already has a project with this canonical ID.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ project: result.project });
}
