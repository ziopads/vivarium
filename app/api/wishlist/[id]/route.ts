import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { getWishlist, addWish, deleteWish, wishSection } from '@/lib/wishlist';
import { getVocab } from '@/lib/vocab';
import { parsePath, formatPath, pathExists } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

// Edit (fill in title, author, type and filing later) and delete — admin only.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const id = Number(params.id);
  const all = await getWishlist();
  const w = all.find((x) => x.id === id);
  if (!w) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: {
    title?: string;
    author?: string;
    itemType?: string;
    classification?: string;
    section?: string;
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (typeof body.title === 'string') w.title = body.title.trim();
  if (typeof body.author === 'string') w.author = body.author.trim();
  if (typeof body.itemType === 'string' && body.itemType.trim()) w.itemType = body.itemType.trim();

  // Filing. Checked against the tree rather than accepted as text, for the reason
  // bulk-classify checks it: a path with a typo names a place nothing can be
  // browsed to, and a wish carries its path into the catalogue when it converts.
  //
  // `section` is written from the path rather than taken from the caller, so the
  // wishlist's section headings stay section names — a whole path in that field
  // would reach validateItem as a section containing separators.
  if (typeof body.classification === 'string') {
    const segments = parsePath(body.classification);
    if (segments.length) {
      const vocab = await getVocab();
      if (!pathExists(vocab.tree, segments)) {
        return NextResponse.json(
          { error: `${formatPath(segments)} is not in the classification` },
          { status: 400 },
        );
      }
    }
    w.classification = formatPath(segments);
    w.section = wishSection(w.classification);
  } else if (typeof body.section === 'string') {
    // Legacy shape, kept for anything still sending a bare section.
    w.section = body.section.trim();
  }

  if (typeof body.note === 'string') w.note = body.note.trim();

  await addWish(w);
  return NextResponse.json({ ok: true, wish: w });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  await deleteWish(Number(params.id));
  return NextResponse.json({ ok: true });
}
