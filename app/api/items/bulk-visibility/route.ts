import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { setColumns } from '@/lib/data';
import { isVisibility } from '@/lib/visibility';

// POST /api/items/bulk-visibility  { ids: number[], visibility: 'public' | 'link' | 'restricted' }
//
// One tier across many records.
//
// Unlike bulk-section there are no cross-field rules to apply — visibility does
// not depend on the record's current state the way a shelf depends on its
// section — so this never reads the catalogue at all. `visibility` is a typed
// column, so setColumns issues one UPDATE ... WHERE id IN (...) per 200 ids.
// Setting a thousand books is five statements.
//
// Admin-only by middleware, which guards every non-GET under /api/items. Same
// arrangement as bulk-section and bulk-delete; there is no second check here.
export async function POST(req: Request) {
  let body: { ids?: number[]; visibility?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const ids = Array.from(
    new Set((body.ids || []).map(Number).filter((n) => Number.isFinite(n))),
  );
  if (!ids.length) return NextResponse.json({ error: 'No ids given' }, { status: 400 });

  // Rejected rather than normalized, for the reason given in the meta route:
  // falling back to 'public' on a bad value publishes what the caller meant to
  // close, and here it would do that to the whole selection at once.
  if (!isVisibility(body.visibility)) {
    return NextResponse.json(
      { error: `Unknown visibility ${JSON.stringify(body.visibility)}` },
      { status: 400 },
    );
  }

  const updated = await setColumns(ids, { visibility: body.visibility });

  revalidatePath('/');
  revalidatePath('/browse');

  // `requested` and `updated` are reported separately so a stale selection — ids
  // that no longer exist — shows up as a difference rather than being counted as
  // success.
  return NextResponse.json({
    ok: true,
    requested: ids.length,
    updated,
    visibility: body.visibility,
  });
}
