import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';

// POST /api/items/bulk-section  { ids: number[], section?: string, shelf?: string }
//
// Sets section and/or shelf on many items in a single write. (Path kept for
// compatibility; it handles shelf too.)
//
// FIELD SEMANTICS — the distinction matters:
//   absent/undefined  leave this field alone
//   ""                clear this field
//   "Art"             set it
//
// SHELVES ARE SECTION-SCOPED (vocab.shelvesBySection), so this route enforces two
// rules the previous version did not, and which are the reason bulk assignment
// could leave records that ingest_batch.py's validate() would reject:
//
//   1. Changing an item's section invalidates a shelf that isn't listed under the
//      new section. Such a shelf is CLEARED, matching what the per-row editor in
//      ManageTable already does.
//   2. An explicit shelf is only applied to items whose (new or existing) section
//      actually lists it. Items where it doesn't fit are skipped and counted
//      rather than silently given an illegal pair.
export async function POST(req: Request) {
  // Persisted via writeLocalItems: Supabase when configured, else local JSON (both modes).
  let body: { ids?: number[]; section?: string; shelf?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const ids = new Set((body.ids || []).map(Number));
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

  const items = await getItems();
  let updated = 0;
  let shelvesCleared = 0;
  let skipped = 0;

  for (const item of items) {
    if (!ids.has(item.id)) continue;

    const nextSection = setSection ? section : item.section || '';

    if (setSection) item.section = section;

    if (setShelf) {
      if (!shelf) {
        item.shelf = '';
      } else if ((sbs[nextSection] || []).includes(shelf)) {
        item.shelf = shelf;
      } else {
        // shelf isn't legal under this item's section — leave the item's shelf as
        // it was and report it, rather than writing a pair the vocabulary rejects
        skipped++;
      }
    }

    // Rule 1: a surviving shelf must still be valid under the (possibly new) section.
    if (item.shelf && !(sbs[nextSection] || []).includes(item.shelf)) {
      item.shelf = '';
      shelvesCleared++;
    }

    updated++;
  }

  await writeLocalItems(items);
  revalidatePath('/');
  revalidatePath('/browse');
  revalidatePath('/manage');
  return NextResponse.json({ ok: true, updated, shelvesCleared, skipped });
}
