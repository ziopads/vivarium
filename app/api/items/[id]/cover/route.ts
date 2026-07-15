import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';

// POST /api/items/:id/cover  { src: "<image-src>" }
// Reorders the item's images so the chosen shot is primary, and sets item.image.
// Works against the local JSON store (used when there is no DATABASE_URL).
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  // Persisted via writeLocalItems: Supabase when configured, else local JSON (both modes).
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

  const idx = (item.images ?? []).findIndex((im) => im.src === src);
  if (idx < 0) return NextResponse.json({ error: 'src not in item images' }, { status: 400 });

  // Persist the choice via the `cover` pointer; the folder scan orders it first.
  const chosen = item.images[idx];
  item.cover = chosen.src;
  item.image = chosen.src;
  item.images = [chosen, ...item.images.filter((_, i) => i !== idx)];

  await writeLocalItems(items);
  revalidatePath(`/items/${id}`);
  revalidatePath('/');

  return NextResponse.json({ ok: true, image: item.image });
}
