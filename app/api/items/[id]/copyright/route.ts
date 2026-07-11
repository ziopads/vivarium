import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';

// POST /api/items/:id/copyright  { src: "<image-src>" }
// Persists which image is the copyright page (item.copyright) — parallel to the
// cover pointer, but it does NOT reorder or change the main image. Re-posting the
// current copyright src clears it (toggle off). Local JSON store only.
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'Image editing is available only against the local JSON store.' },
      { status: 400 },
    );
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
  if (!(item.images ?? []).some((im) => im.src === src)) {
    return NextResponse.json({ error: 'src not in item images' }, { status: 400 });
  }

  item.copyright = item.copyright === src ? '' : src; // toggle
  await writeLocalItems(items);
  revalidatePath(`/items/${id}`);

  return NextResponse.json({ ok: true, copyright: item.copyright });
}
