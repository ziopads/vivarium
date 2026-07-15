import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';

// POST /api/items/:id/visibility  — toggles item.visibility between
// "public" and "restricted". Local JSON store only.
// (Actual hiding of restricted items from the public site awaits auth; for now
//  this persists the flag and drives the "Private" badges.)
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  // Persisted via writeLocalItems: Supabase when configured, else local JSON (both modes).
  const id = Number(params.id);
  const items = await getItems();
  const item = items.find((i) => i.id === id);
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  item.visibility = item.visibility === 'restricted' ? 'public' : 'restricted';
  await writeLocalItems(items);
  revalidatePath(`/items/${id}`);
  revalidatePath('/');

  return NextResponse.json({ ok: true, visibility: item.visibility });
}
