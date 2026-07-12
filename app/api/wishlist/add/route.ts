import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { addWish, nextWishId } from '@/lib/wishlist';
import { uploadToR2, r2Configured } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// POST /api/wishlist/add  (multipart: image?, title?, author?, section?, note?)
// Any signed-in, allowlisted user may add. Image is optional (photo-only is fine).
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer.isAuthed) return NextResponse.json({ error: 'Sign in to add to the wishlist.' }, { status: 401 });

  const form = await req.formData();
  const title = String(form.get('title') || '').trim();
  const author = String(form.get('author') || '').trim();
  const section = String(form.get('section') || '').trim();
  const note = String(form.get('note') || '').trim();
  const file = form.get('image');

  const id = await nextWishId();

  let image: string | undefined;
  if (file && typeof file === 'object' && 'arrayBuffer' in file) {
    if (!r2Configured()) {
      return NextResponse.json({ error: 'Image storage is not configured.' }, { status: 400 });
    }
    const key = `wishlist/${id}.webp`;
    const buf = Buffer.from(await (file as File).arrayBuffer());
    await uploadToR2(key, buf, 'image/webp');
    image = key;
  }

  if (!image && !title) {
    return NextResponse.json({ error: 'Add a photo or a title.' }, { status: 400 });
  }

  await addWish({
    id,
    title,
    author,
    section,
    note: note || undefined,
    image,
    addedBy: viewer.email || '',
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, id });
}
