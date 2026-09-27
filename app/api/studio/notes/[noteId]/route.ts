import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { deleteNote, getNote, getStudioViewer, updateNote } from '@/lib/studio';
import { parseNoteBody } from '@/lib/studioTypes';

export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// PATCH /api/studio/notes/:noteId   { body?, trackId? }
// The author only: a note is someone's own words, so nobody else rewrites it.
export async function PATCH(req: Request, { params }: { params: { noteId: string } }) {
  const viewer = await getStudioViewer();
  if (!viewer) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const id = parseId(params.noteId);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const note = await getNote(id);
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  if (note.author !== viewer.email) return NextResponse.json({ error: 'Only the author can edit a note.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const patch: { body?: string; trackId?: number | null } = {};
  if ('body' in body) {
    const text = parseNoteBody(body.body);
    if ('error' in text) return NextResponse.json({ error: text.error }, { status: 400 });
    patch.body = text.value;
  }
  if ('trackId' in body) {
    if (body.trackId === null || body.trackId === '') patch.trackId = null;
    else {
      const t = parseId(String(body.trackId));
      if (!t) return NextResponse.json({ error: 'Invalid track' }, { status: 400 });
      patch.trackId = t;
    }
  }
  const result = await updateNote(id, patch);
  if (!result.ok) {
    return result.reason === 'not-found'
      ? NextResponse.json({ error: 'Note not found' }, { status: 404 })
      : NextResponse.json({ error: 'That version is not part of this project.' }, { status: 400 });
  }
  return NextResponse.json({ note: result.note });
}

// DELETE /api/studio/notes/:noteId — the author, or an admin.
export async function DELETE(_req: Request, { params }: { params: { noteId: string } }) {
  const [studio, viewer] = await Promise.all([getStudioViewer(), getViewer()]);
  if (!studio) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const id = parseId(params.noteId);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const note = await getNote(id);
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  if (note.author !== studio.email && !viewer.isAdmin) {
    return NextResponse.json({ error: 'Only the author or an admin can delete a note.' }, { status: 403 });
  }
  await deleteNote(id);
  return NextResponse.json({ ok: true });
}
