import { NextResponse } from 'next/server';
import { getItems } from '@/lib/data';

export const dynamic = 'force-dynamic';

// GET /api/items?q=&type=&subject=&place=  (read-only)
export async function GET(req: Request) {
  const items = await getItems();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.toLowerCase();
  const type = searchParams.get('type');
  const subject = searchParams.get('subject');
  const place = searchParams.get('place');

  const result = items.filter((i) => {
    if (q) {
      const hay =
        `${i.title} ${i.author} ${i.publisher} ${i.subjects.join(' ')} ${i.places.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (type && i.itemType !== type) return false;
    if (subject && !i.subjects.includes(subject)) return false;
    if (place && !i.places.includes(place)) return false;
    return true;
  });

  return NextResponse.json(result);
}
