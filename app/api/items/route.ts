import { NextResponse } from 'next/server';
import { getItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { getViewer } from '@/lib/auth';
import { publicView } from '@/lib/fieldVisibility';

export const dynamic = 'force-dynamic';

// GET /api/items?q=&type=&subject=&place=  (read-only)
//
// Field visibility is enforced HERE, on the server, before serialization.
// Admins get full records; everyone else gets publicView-stripped ones, so the
// wire never carries prices to the public tier no matter what the client does.
export async function GET(req: Request) {
  const [items, viewer] = await Promise.all([getItems(), getViewer()]);
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

  if (viewer.isAdmin) {
    return NextResponse.json(result);
  }
  const { publicFields } = await getVocab();
  return NextResponse.json(result.map((i) => publicView(i, publicFields)));
}
