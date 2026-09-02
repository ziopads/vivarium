import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItem, updateItem } from '@/lib/data';
import { typeFields } from '@/lib/itemTypes';

// POST /api/items/:id/meta
//   { section?, shelf?, genres?, subjects?, location?, notes?, condition?, conditionNotes? }
//
// Writes through updateItem, which touches one row. This route used to read the
// whole catalogue, mutate one object in it and write every record back, so a
// single dropdown change in /manage or the list view rewrote the table — and two
// edits in flight together could revert each other, because last-write-wins
// applied to the entire set rather than the edited field.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  let body: {
    section?: string; shelf?: string; genres?: string[]; subjects?: string[];
    location?: string; notes?: string; condition?: string; conditionNotes?: string;
    itemType?: string; fields?: Record<string, string>;
    title?: string; author?: string; source?: string; pricePaid?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Only type-specific `fields` need the current record, and only for its
  // itemType. Everything else goes straight to updateItem, which for a
  // column-only patch is a single UPDATE with no read — so a section change is
  // one round trip rather than three.
  const clean = (arr: string[]) =>
    Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

  const patch: Record<string, any> = {};

  // Title must never be blanked; author may be cleared.
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.author === 'string') patch.author = body.author.trim();
  // Acquisition / provenance — admin-only, shown only to admins on the detail page.
  if (typeof body.source === 'string') patch.source = body.source.trim();
  if (typeof body.pricePaid === 'string') patch.pricePaid = body.pricePaid.trim();
  if (typeof body.section === 'string') patch.section = body.section.trim();
  if (typeof body.shelf === 'string') patch.shelf = body.shelf.trim();
  if (Array.isArray(body.genres)) patch.genres = clean(body.genres);
  if (Array.isArray(body.subjects)) patch.subjects = clean(body.subjects);
  if (typeof body.location === 'string') patch.location = body.location.trim();
  if (typeof body.notes === 'string') patch.notes = body.notes.trim();
  if (typeof body.condition === 'string') patch.condition = body.condition.trim();
  if (typeof body.conditionNotes === 'string') patch.conditionNotes = body.conditionNotes.trim();
  if (typeof body.itemType === 'string' && body.itemType.trim()) patch.itemType = body.itemType.trim();

  if (body.fields && typeof body.fields === 'object') {
    // Only allow keys defined for this item's type — no arbitrary property
    // writes. A type change in the same request takes effect first, matching the
    // previous behaviour.
    let nextType = patch.itemType;
    if (!nextType) {
      const current = await getItem(id);
      if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      nextType = current.itemType;
    }
    const allowed = new Set(typeFields(nextType).map((f) => f.key));
    for (const [k, v] of Object.entries(body.fields)) {
      if (allowed.has(k)) patch[k] = typeof v === 'string' ? v.trim() : v;
    }
  }

  const updated = await updateItem(id, patch);
  if (!updated) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  revalidatePath(`/items/${id}`);
  revalidatePath('/');
  revalidatePath('/browse');
  return NextResponse.json({ ok: true, ...updated });
}
