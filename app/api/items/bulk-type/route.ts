import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { setColumns, filingFor } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { pathServesType } from '@/lib/taxonomy';

// POST /api/items/bulk-type  { ids: number[], itemType: string, force?: boolean }
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
// It does not move anything either, and that is the hazard this route now
// guards. A branch declares which item types it serves; retyping a record whose
// path is not served by its new type leaves it exactly where it was, filed
// somewhere its own picker will no longer offer. Nothing is unfiled and nothing
// is lost, but it goes quiet, which is the failure worth a sentence on screen.
// The refusal names the paths and the count, and `force` goes through.
//
// Admin-only by middleware, which guards every non-GET under /api/items.
export async function POST(req: Request) {
  let body: { ids?: number[]; itemType?: string; force?: boolean };
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

  // Which of the selected records would be left filed somewhere their new type
  // is not served by. Unfiled records cannot be stranded and are skipped. While
  // no root carries a tag the check finds nothing, since an untagged branch
  // serves every type — so on this catalogue today the cost is the one query.
  if (!body.force) {
    const vocab = await getVocab();
    const filing = await filingFor(ids);
    const stranded: { path: string; count: number }[] = [];
    const byPath = new Map<string, number>();
    for (const { classification } of filing.values()) {
      if (!classification) continue;
      if (pathServesType(vocab.tree, classification, itemType)) continue;
      byPath.set(classification, (byPath.get(classification) ?? 0) + 1);
    }
    for (const [path, count] of byPath) stranded.push({ path, count });

    if (stranded.length) {
      const total = stranded.reduce((n, s) => n + s.count, 0);
      // Three paths named at most. A selection of four hundred can span dozens,
      // and a message listing all of them is one nobody reads.
      const named = stranded
        .slice(0, 3)
        .map((s) => `${s.path} (${s.count})`)
        .join(', ');
      return NextResponse.json(
        {
          error:
            `${total} record${total === 1 ? '' : 's'} would stay filed where ${itemType} ` +
            `is not served — ${named}` +
            (stranded.length > 3 ? `, and ${stranded.length - 3} more` : '') +
            `. They keep their place and stop being offered it.`,
          stranded,
          total,
        },
        { status: 409 },
      );
    }
  }

  const updated = await setColumns(ids, { itemType });

  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath('/manage');

  return NextResponse.json({ ok: true, requested: ids.length, updated, itemType });
}
