import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, setColumns } from '@/lib/data';
import { getVocab } from '@/lib/vocab';

// POST /api/items/bulk-section  { ids: number[], section?: string, shelf?: string }
//
// Sets section and/or shelf on many items. (Path kept for compatibility; it
// handles shelf too.)
//
// FIELD SEMANTICS — the distinction matters:
//   absent/undefined  leave this field alone
//   ""                clear this field
//   "Art"             set it
//
// SHELVES ARE SECTION-SCOPED (vocab.shelvesBySection), so two rules apply:
//
//   1. Changing an item's section invalidates a shelf that isn't listed under
//      the new section. Such a shelf is CLEARED, matching the per-row editor.
//   2. An explicit shelf is only applied to items whose (new or existing)
//      section actually lists it. Items where it doesn't fit are skipped and
//      counted rather than given an illegal pair.
//
// Those rules mean different selected items can need different writes, so the
// work is grouped by outcome and each group goes out as one UPDATE ... WHERE id
// IN (...). Assigning a section to a thousand books is one or two statements,
// where the previous version read the whole catalogue and upserted every row.
export async function POST(req: Request) {
  let body: { ids?: number[]; section?: string; shelf?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const ids = new Set((body.ids || []).map(Number).filter((n) => Number.isFinite(n)));
  if (!ids.size) return NextResponse.json({ error: 'No ids given' }, { status: 400 });

  const setSection = body.section !== undefined;
  const setShelf = body.shelf !== undefined;
  if (!setSection && !setShelf) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }

  const section = (body.section || '').trim();
  const shelf = (body.shelf || '').trim();

  const vocab = await getVocab();
  const sbs = vocab.shelvesBySection || {};

  if (setSection && section && !vocab.sections.includes(section)) {
    return NextResponse.json({ error: `Unknown section ${section}` }, { status: 400 });
  }

  // The current rows are needed to apply the section-scoped shelf rules, which
  // depend on each item's existing section. One read, then targeted writes.
  const items = await getItems();

  // outcome key -> ids getting exactly that patch
  const groups = new Map<string, { patch: Record<string, string>; ids: number[] }>();
  let skipped = 0;
  let shelvesCleared = 0;

  for (const item of items) {
    if (!ids.has(item.id)) continue;

    const nextSection = setSection ? section : item.section || '';
    const patch: Record<string, string> = {};
    if (setSection) patch.section = section;

    let nextShelf = item.shelf || '';
    if (setShelf) {
      if (!shelf) {
        nextShelf = '';
      } else if ((sbs[nextSection] || []).includes(shelf)) {
        nextShelf = shelf;
      } else {
        skipped++;
      }
    }

    // Rule 1: a surviving shelf must still be valid under the new section.
    if (nextShelf && !(sbs[nextSection] || []).includes(nextShelf)) {
      nextShelf = '';
      shelvesCleared++;
    }

    if (nextShelf !== (item.shelf || '')) patch.shelf = nextShelf;
    if (!Object.keys(patch).length) continue;

    const key = JSON.stringify(patch);
    const g = groups.get(key);
    if (g) g.ids.push(item.id);
    else groups.set(key, { patch, ids: [item.id] });
  }

  let updated = 0;
  for (const { patch, ids: group } of groups.values()) {
    updated += await setColumns(group, patch);
  }

  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath('/manage');
  return NextResponse.json({ ok: true, updated, shelvesCleared, skipped });
}
