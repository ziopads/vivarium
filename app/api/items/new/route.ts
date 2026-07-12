import { NextResponse } from 'next/server';
import { getItems, writeLocalItems } from '@/lib/data';
import type { Item } from '@/lib/types';

// POST /api/items/new  { itemType?, title? }  → creates a blank item, returns its id.
// Admin-guarded by middleware. Next id = max existing + 1 (no id reuse).
export async function POST(req: Request) {
  let body: { itemType?: string; title?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const items = await getItems();
  const nextId = items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
  const itemType = (body.itemType || 'Book').trim() || 'Book';

  const item: Item = {
    id: nextId,
    itemType,
    title: (body.title || 'Untitled').trim() || 'Untitled',
    author: '',
    publisher: '',
    placeOfPublication: '',
    year: '',
    edition: '',
    printing: '',
    isbn: '',
    format: '',
    description: '',
    blurb: '',
    signed: false,
    inscription: '',
    genres: [],
    shelf: '',
    images: [],
    subjects: [],
    places: [],
    condition: '',
    location: '',
    owner: '',
    notes: '',
    image: null,
    // Books are the public catalogue; non-book items (frames, personal objects)
    // default to private and can be made public per-item.
    visibility: itemType === 'Book' ? 'public' : 'restricted',
  };

  await writeLocalItems([...items, item]);
  return NextResponse.json({ ok: true, id: nextId });
}
