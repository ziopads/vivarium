import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { setColumns } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { parsePath, formatPath, pathExists } from '@/lib/taxonomy';

// POST /api/items/bulk-classify  { ids: number[], classification: string }
//
// Files many records at one place in the classification tree. An empty
// classification unfiles them.
//
// This replaces bulk-section, and is most of a file shorter than it. That route
// had to reconcile two fields against each other: a shelf is only legal under
// the section that lists it, so changing a section could invalidate a shelf, and
// an explicit shelf had to be checked against each item's own section. Items
// therefore needed different writes from the same request, which meant reading
// the whole catalogue and grouping them by outcome.
//
// A path removes all of that. It states the whole position in one value, so
// every selected record gets the identical write, there is nothing to reconcile,
// and the catalogue is never read: one UPDATE ... WHERE id IN (...) per 200 ids.
//
// Admin-only by middleware, which guards every non-GET under /api/items.
export async function POST(req: Request) {
  let body: { ids?: number[]; classification?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const ids = Array.from(
    new Set((body.ids || []).map(Number).filter((n) => Number.isFinite(n))),
  );
  if (!ids.length) return NextResponse.json({ error: 'No ids given' }, { status: 400 });

  const segments = parsePath(body.classification);
  const classification = formatPath(segments);

  // Checked against the tree rather than accepted as text. A path with a typo in
  // it names a place nothing can be browsed to and nothing will ever be found
  // at — a silent hole rather than a visible error.
  if (segments.length) {
    const vocab = await getVocab();
    if (!pathExists(vocab.tree, segments)) {
      return NextResponse.json(
        { error: `${classification} is not in the classification` },
        { status: 400 },
      );
    }
  }

  const updated = await setColumns(ids, { classification });

  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath('/manage');

  return NextResponse.json({
    ok: true,
    requested: ids.length,
    updated,
    classification,
  });
}
