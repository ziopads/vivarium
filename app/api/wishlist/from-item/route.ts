import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { getItem, deleteItems } from '@/lib/data';
import { addWish, nextWishId, wishFromItem } from '@/lib/wishlist';

export const dynamic = 'force-dynamic';

// POST /api/wishlist/from-item  { itemId }
//
// Moves a catalogue record to the wishlist: a book lost, given away or sold,
// which you would take back. The write-up travels with it, so someone browsing
// the wishlist can see why the book is wanted rather than reading a bare title.
//
// The record is deleted afterwards but its R2 objects are not, which is
// deliberate — the wish carries the gallery and can still render the
// photographs of the copy that left.
//
// ORDER: the wish is created FIRST. If the delete then fails you have a wish and
// a record, which is a tidy-up. The other order could lose the write-up.
//
// Admin only. Middleware guards non-GET under /api/items, not /api/wishlist, so
// this route checks for itself.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  let body: { itemId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const itemId = Number(body.itemId);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
  }

  const item = await getItem(itemId);
  if (!item) return NextResponse.json({ error: `No item ${itemId}` }, { status: 404 });

  const wishId = await nextWishId();
  const wish = wishFromItem(item, wishId, viewer.email || '');
  await addWish(wish);

  const removed = await deleteItems([itemId]);

  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath('/wishlist');
  return NextResponse.json({
    ok: true,
    wishId,
    itemDeleted: removed.length === 1,
    keptWriteup: !!(wish.description || wish.discussion),
  });
}
