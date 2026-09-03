import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItem, updateItem, deleteItems } from '@/lib/data';
import { mergePlan, hasImages } from '@/lib/duplicates';

// POST /api/items/merge  { survivorId, loserId }
//
// Fills the survivor's blank fields from the loser, then deletes the loser.
// The survivor is the record with the photographs; the loser is the older
// hand-entered record carrying the write-up.
//
// ORDER MATTERS: the survivor is updated FIRST and the loser deleted second. If
// the delete fails you are left with a merged survivor and a still-present
// loser, which is a duplicate to clean up. The other order would risk deleting
// the only copy of a write-up that never landed.
export async function POST(req: Request) {
  let body: { survivorId?: number; loserId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const survivorId = Number(body.survivorId);
  const loserId = Number(body.loserId);
  if (!Number.isFinite(survivorId) || !Number.isFinite(loserId)) {
    return NextResponse.json({ error: 'survivorId and loserId are required' }, { status: 400 });
  }
  if (survivorId === loserId) {
    return NextResponse.json({ error: 'A record cannot be merged into itself' }, { status: 400 });
  }

  const [survivor, loser] = await Promise.all([getItem(survivorId), getItem(loserId)]);
  if (!survivor) return NextResponse.json({ error: `No item ${survivorId}` }, { status: 404 });
  if (!loser) return NextResponse.json({ error: `No item ${loserId}` }, { status: 404 });

  // Refuse to destroy images. The loser is meant to be the record without any;
  // if it has them, this is not the pair the tool was designed for and the
  // deletion would orphan its R2 objects.
  if (hasImages(loser)) {
    return NextResponse.json(
      { error: `Item ${loserId} has images — merge would delete them. Check the pair.` },
      { status: 409 },
    );
  }

  const { patch, filled } = mergePlan(survivor, loser);

  const updated = await updateItem(survivorId, patch);
  if (!updated) return NextResponse.json({ error: `No item ${survivorId}` }, { status: 404 });

  const removed = await deleteItems([loserId]);

  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath(`/items/${survivorId}`);
  return NextResponse.json({
    ok: true,
    survivorId,
    loserId,
    filled,
    deleted: removed.length === 1,
  });
}
