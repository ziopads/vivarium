import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { addWish, nextWishId } from '@/lib/wishlist';
import { uploadToR2, r2Configured } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// POST /api/wishlist/add  (multipart: image* (repeatable), title?, author?, section?, note?)
// Any signed-in, allowlisted user may add. Images are optional (title-only is fine).
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer.isAuthed) return NextResponse.json({ error: 'Sign in to add to the wishlist.' }, { status: 401 });

  const form = await req.formData();
  const title = String(form.get('title') || '').trim();
  const author = String(form.get('author') || '').trim();
  const section = String(form.get('section') || '').trim();
  const note = String(form.get('note') || '').trim();
  // getAll, not get. `get` returns the first file and silently drops the rest,
  // which is how a book photographed cover-and-copyright-page arrived in the
  // wishlist as a cover alone.
  const files = form
    .getAll('image')
    .filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f);

  const id = await nextWishId();

  const images: string[] = [];
  if (files.length) {
    if (!r2Configured()) {
      return NextResponse.json({ error: 'Image storage is not configured.' }, { status: 400 });
    }
    // wishlist/<id>/01.webp, 02, … One key per photograph. The old flat
    // wishlist/<id>.webp could only ever hold one, since every upload for a
    // given wish resolved to the same key and overwrote the last.
    for (const [i, file] of files.entries()) {
      const key = `wishlist/${id}/${String(i + 1).padStart(2, '0')}.webp`;
      const buf = Buffer.from(await file.arrayBuffer());
      await uploadToR2(key, buf, 'image/webp');
      images.push(key);
    }
  }

  if (!images.length && !title) {
    return NextResponse.json({ error: 'Add a photo or a title.' }, { status: 400 });
  }

  await addWish({
    id,
    title,
    author,
    section,
    note: note || undefined,
    // `image` remains the cover, so list views and anything reading the old
    // field keep working without knowing about `images`.
    image: images[0],
    images: images.length ? images : undefined,
    addedBy: viewer.email || '',
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, id, images: images.length });
}
