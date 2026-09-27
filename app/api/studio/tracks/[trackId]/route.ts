import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { deleteTrackRow, getStudioViewer, getTrackWithKey } from '@/lib/studio';
import { deleteAudio } from '@/lib/studioAudio';

export const dynamic = 'force-dynamic';

// DELETE /api/studio/tracks/:trackId
// ADMINS ONLY. The studio is the archive of record for reference mixes, so
// members can add versions but not remove them. Notes that pointed at the
// track keep their text and lose the pointer (ON DELETE SET NULL). The next
// upload takes the highest remaining version + 1, so deleting the newest
// version frees its number for reuse.
export async function DELETE(_req: Request, { params }: { params: { trackId: string } }) {
  const [studio, viewer] = await Promise.all([getStudioViewer(), getViewer()]);
  if (!studio || !viewer.isAdmin) return NextResponse.json({ error: 'Admins only.' }, { status: 403 });

  const id = Number(params.trackId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const found = await getTrackWithKey(id);
  if (!found) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

  await deleteTrackRow(id);
  // Row first, then the object: a failed object delete leaves an orphan in the
  // bucket (harmless, costs pennies), never a row pointing at nothing.
  try {
    await deleteAudio(found.key);
  } catch (err) {
    console.error('studio audio delete failed', found.key, err);
  }
  return NextResponse.json({ ok: true });
}
