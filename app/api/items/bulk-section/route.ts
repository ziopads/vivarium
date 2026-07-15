import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';

// POST /api/items/bulk-section  { ids: number[], section: string }
// Sets the same section on many items in a single write.
export async function POST(req: Request) {
  // Persisted via writeLocalItems: Supabase when configured, else local JSON (both modes).
  let body: { ids?: number[]; section?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const ids = new Set((body.ids || []).map(Number));
  const section = (body.section || '').trim();
  if (!ids.size) return NextResponse.json({ error: 'No ids given' }, { status: 400 });

  const items = await getItems();
  let updated = 0;
  for (const item of items) {
    if (ids.has(item.id)) {
      item.section = section;
      updated++;
    }
  }

  await writeLocalItems(items);
  revalidatePath('/');
  revalidatePath('/browse');
  return NextResponse.json({ ok: true, updated, section });
}
