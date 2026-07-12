import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { getWishlist, addWish, deleteWish } from '@/lib/wishlist';

export const dynamic = 'force-dynamic';

// Edit (fill in title/author/section later) and delete — admin only.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const id = Number(params.id);
  const all = await getWishlist();
  const w = all.find((x) => x.id === id);
  if (!w) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { title?: string; author?: string; section?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (typeof body.title === 'string') w.title = body.title.trim();
  if (typeof body.author === 'string') w.author = body.author.trim();
  if (typeof body.section === 'string') w.section = body.section.trim();
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
