import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { setColumns } from '@/lib/data';

// POST /api/items/bulk-type  { ids: number[], itemType: string }
//
// One type across many records. `item_type` is a typed column with no
// cross-field rules, so this never reads the catalogue: setColumns issues one
// UPDATE ... WHERE id IN (...) per 200 ids.
//
// Free text is accepted, matching the per-item picker — TYPE_OPTIONS is a list
// of suggestions rather than a controlled vocabulary, and lib/itemTypes.ts only
// decides which extra FIELDS a type shows. An unknown type is a record with no
// type-specific fields, which is exactly what Book is.
//
// Changing a type does NOT clear the previous type's fields: they live in the
// JSONB tail and stay there, invisible until the record is set back. That is
// deliberate — a mis-click should not throw away frame dimensions.
//
// Admin-only by middleware, which guards every non-GET under /api/items.
export async function POST(req: Request) {
  let body: { ids?: number[]; itemType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const ids = Array.from(
    new Set((body.ids || []).map(Number).filter((n) => Number.isFinite(n))),
  );
  if (!ids.length) return NextResponse.json({ error: 'No ids given' }, { status: 400 });

  const itemType = (body.itemType || '').trim();
  if (!itemType) {
    return NextResponse.json(
      { error: 'A type is required — there is no untyped record' },
      { status: 400 },
    );
  }

  const updated = await setColumns(ids, { itemType });

  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath('/manage');

  return NextResponse.json({ ok: true, requested: ids.length, updated, itemType });
}
