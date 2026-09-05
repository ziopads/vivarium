import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { setColumns, filingFor } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { parsePath, formatPath, pathExists, typesAt, servesType } from '@/lib/taxonomy';

// POST /api/items/bulk-classify  { ids: number[], classification: string, force?: boolean }
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
// and the CATALOGUE is never read. The type check below reads `id, item_type`
// for the selected ids and nothing else, which is O(selection) and keeps that
// property; it is also skipped entirely when the destination is untagged, which
// is every branch in the vocabulary until somebody tags one.
//
// Admin-only by middleware, which guards every non-GET under /api/items.
export async function POST(req: Request) {
  let body: { ids?: number[]; classification?: string; force?: boolean };
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

    // And checked against the types the destination serves. A record shelf and a
    // book shelf are different taxonomies, so filing forty books under Recordings
    // is a mistake worth stopping rather than a preference — but it is the
    // operator's catalogue, so it is refused with the count and the type names
    // and goes through on `force`.
    //
    // `typesAt` returning undefined means the branch serves everything, which is
    // every branch until one is tagged. No query is made in that case.
    const served = typesAt(vocab.tree, segments);
    if (served && !body.force) {
      const filing = await filingFor(ids);
      const counts = new Map<string, number>();
      for (const { itemType } of filing.values()) {
        // Ids that no longer exist are absent from the map rather than counted;
        // setColumns skips them too, so a stale selection cannot fail the write.
        if (!servesType(served, itemType)) counts.set(itemType, (counts.get(itemType) ?? 0) + 1);
      }
      if (counts.size) {
        const total = [...counts.values()].reduce((a, b) => a + b, 0);
        return NextResponse.json(
          {
            error:
              `${classification} does not take ` +
              [...counts].map(([t, c]) => `${t} (${c})`).join(', ') +
              `. It serves ${served.join(', ')}.`,
            refused: [...counts].map(([itemType, count]) => ({ itemType, count })),
            total,
            serves: served,
          },
          { status: 409 },
        );
      }
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
