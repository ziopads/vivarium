import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getItems, writeLocalItems } from '@/lib/data';

// POST /api/items/:id/delete  — removes the record from items.json and deletes
// its image folder (public/items/<id6>/). Local JSON store only.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  // Persisted via writeLocalItems: Supabase when configured, else local JSON (both modes).
  const id = Number(params.id);
  const items = await getItems();
  if (!items.some((i) => i.id === id)) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  await writeLocalItems(items.filter((i) => i.id !== id));

  // best-effort removal of the on-disk image folder
  try {
    const dir = path.join(process.cwd(), 'public', 'items', String(id).padStart(6, '0'));
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* folder may not exist — fine */
  }

  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
