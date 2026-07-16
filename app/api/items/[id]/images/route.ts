import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { getItems, writeLocalItems } from '@/lib/data';
import { uploadToR2, deleteFromR2, r2Configured } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// POST /api/items/:id/images   (multipart: full[], thumb[] — paired webp blobs)
// Admin-only. Uploads each shot to R2 under items/<id6>/<nn>-photo.webp and appends
// it to the item's images[]. If the item had no cover yet, the first new shot becomes it.
// Follows the same read-all → mutate → write-all pattern as the cover route.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: 'Image storage is not configured.' }, { status: 400 });
  }

  const id = Number(params.id);
  const id6 = String(id).padStart(6, '0');

  const form = await req.formData();
  const fulls = form.getAll('full').filter((f) => typeof f === 'object' && 'arrayBuffer' in f) as File[];
  const thumbs = form.getAll('thumb').filter((f) => typeof f === 'object' && 'arrayBuffer' in f) as File[];
  if (!fulls.length) {
    return NextResponse.json({ error: 'No images provided.' }, { status: 400 });
  }

  const items = await getItems();
  const item = items.find((i) => i.id === id);
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  // Continue numbering after any images already on the item.
  const existing = item.images ?? [];
  let start = 0;
  for (const im of existing) {
    const m = /(?:^|\/)(\d+)-/.exec(im.src);
    if (m) start = Math.max(start, Number(m[1]));
  }

  const added: { src: string; label: string }[] = [];
  for (let i = 0; i < fulls.length; i++) {
    const nn = String(start + i + 1).padStart(2, '0');
    const stem = `${nn}-photo`;
    const key = `items/${id6}/${stem}`;
    await uploadToR2(`${key}.webp`, Buffer.from(await fulls[i].arrayBuffer()), 'image/webp');
    if (thumbs[i]) {
      await uploadToR2(`${key}-thumb.webp`, Buffer.from(await thumbs[i].arrayBuffer()), 'image/webp');
    }
    added.push({ src: `${id6}/${stem}`, label: 'Photo' });
  }

  item.images = [...existing, ...added];
  if (!item.cover) {
    item.cover = added[0].src;
    item.image = added[0].src;
  }

  await writeLocalItems(items);
  revalidatePath(`/items/${id}`);
  revalidatePath('/');
  return NextResponse.json({ ok: true, added: added.length });
}

// DELETE /api/items/:id/images   { src: "<id6>/<stem>" }
// Admin-only. Removes one shot from the item's gallery, fixes the cover/copyright
// pointers if they referenced it, persists, then best-effort deletes the R2 objects.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  }

  const id = Number(params.id);
  let src = '';
  try {
    ({ src } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!src) return NextResponse.json({ error: 'Missing src' }, { status: 400 });

  const items = await getItems();
  const item = items.find((i) => i.id === id);
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const imgs = item.images ?? [];
  const idx = imgs.findIndex((im) => im.src === src);
  if (idx < 0) return NextResponse.json({ error: 'src not in item images' }, { status: 400 });

  item.images = imgs.filter((_, i) => i !== idx);
  if (item.copyright === src) item.copyright = undefined;
  if (item.cover === src || item.image === src) {
    const first = item.images[0];
    item.cover = first ? first.src : undefined;
    item.image = first ? first.src : null;
  }

  await writeLocalItems(items);

  // Best-effort R2 cleanup — orphaned objects are harmless, so never fail on this.
  if (r2Configured()) {
    try {
      await deleteFromR2(`items/${src}.webp`);
      await deleteFromR2(`items/${src}-thumb.webp`);
    } catch {
      /* ignore */
    }
  }

  revalidatePath(`/items/${id}`);
  revalidatePath('/');
  return NextResponse.json({ ok: true, remaining: item.images.length });
}
