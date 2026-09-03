import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth';
import { createItem, nextItemId } from '@/lib/data';
import { getWishlist, deleteWish, itemFromWish } from '@/lib/wishlist';

export const dynamic = 'force-dynamic';

// POST /api/wishlist/:id/to-item
//
// The return trip: a wished-for book arrives, usually as a gift, and becomes a
// catalogue record without being retyped. Title, author, section, publisher,
// year, ISBN, the note and the write-up all come back, along with the gallery if
// the wish was made from a record that had one.
//
// The new record gets a fresh id. Ids are never reused, so it does not reclaim
// the one it had before it left.
//
// ORDER: the item is created FIRST, the wish deleted second — a failure leaves
// both rather than neither.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const id = Number(params.id);
  const wishes = await getWishlist();
  const wish = wishes.find((w) => w.id === id);
  if (!wish) return NextResponse.json({ error: `No wish ${id}` }, { status: 404 });

  const itemId = await nextItemId();
  const item = itemFromWish(wish, itemId);
  await createItem(item);

  await deleteWish(id);

  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath('/wishlist');
  revalidatePath(`/items/${itemId}`);
  return NextResponse.json({ ok: true, itemId });
}
