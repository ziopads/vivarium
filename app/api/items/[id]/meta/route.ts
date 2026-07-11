import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';

// POST /api/items/:id/meta
//   { section?, shelf?, genres?, subjects?, location?, notes?, condition?, conditionNotes? }
// Edits fields against the local JSON store (used when no DATABASE_URL).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Editing is available only against the local JSON store.' }, { status: 400 });
  }
  const id = Number(params.id);
  let body: {
    section?: string; shelf?: string; genres?: string[]; subjects?: string[];
    location?: string; notes?: string; condition?: string; conditionNotes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const items = await getItems();
  const item = items.find((i) => i.id === id);
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const clean = (arr: string[]) =>
    Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

  if (typeof body.section === 'string') item.section = body.section.trim();
  if (typeof body.shelf === 'string') item.shelf = body.shelf.trim();
  if (Array.isArray(body.genres)) item.genres = clean(body.genres);
  if (Array.isArray(body.subjects)) item.subjects = clean(body.subjects);
  if (typeof body.location === 'string') item.location = body.location.trim();
  if (typeof body.notes === 'string') item.notes = body.notes.trim();
  if (typeof body.condition === 'string') item.condition = body.condition.trim();
  if (typeof body.conditionNotes === 'string') item.conditionNotes = body.conditionNotes.trim();

  await writeLocalItems(items);
  revalidatePath(`/items/${id}`);
  revalidatePath('/');
  revalidatePath('/browse');
  return NextResponse.json({ ok: true, ...item });
}
