import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { deleteItems } from '@/lib/data';

// POST /api/items/bulk-delete  { ids: number[] }
//
// Deletes the named records in one pass via deleteItems, which issues a targeted
// delete rather than rewriting the catalogue. The >10 guard in writeLocalItems is
// not involved and stays intact — it exists to catch a delete IMPLIED by a
// truncated read, and these ids are named explicitly.
//
// Returns the ids actually removed, separately from the ids asked for, so the
// caller can tell "deleted 340" from "asked for 340, 338 existed". A stale
// selection is reported, not an error.
//
// IMAGES: the local public/items/<id6>/ folder is removed best-effort, mirroring
// the single-item delete route. R2 objects are NOT touched by either — a record
// with images that gets deleted leaves its objects in the bucket. That is why the
// UI counts selected records with images before confirming.
export async function POST(req: Request) {
  let body: { ids?: number[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const ids = Array.from(
    new Set((body.ids || []).map(Number).filter((n) => Number.isFinite(n))),
  );
  if (!ids.length) return NextResponse.json({ error: 'No ids given' }, { status: 400 });

  const removed = await deleteItems(ids);
  const gone = new Set(removed);

  for (const id of removed) {
    try {
      await fs.rm(path.join(process.cwd(), 'public', 'items', String(id).padStart(6, '0')), {
        recursive: true,
        force: true,
      });
    } catch {
      /* folder may not exist — fine */
    }
  }

  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath('/manage');
  return NextResponse.json({
    ok: true,
    requested: ids.length,
    removed,
    missing: ids.filter((id) => !gone.has(id)),
  });
}
