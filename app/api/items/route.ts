import { NextResponse } from 'next/server';
import { getItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { getViewer } from '@/lib/auth';
import { publicView } from '@/lib/fieldVisibility';
import { canView } from '@/lib/visibility';

export const dynamic = 'force-dynamic';

// GET /api/items?q=&type=&subject=&place=  (read-only)
//
// TWO separate filters, and they were not both here. Field visibility — admins
// get full records, everyone else gets publicView-stripped ones — was enforced,
// so prices never crossed the wire. But the RECORD SET was not: this route calls
// getItems() rather than getVisibleItems(), so a restricted book's id, title and
// author were served to anyone, stripped but present. The tier check below is
// the fix, and it is why /browse and this endpoint now agree about what exists.
export async function GET(req: Request) {
  const [items, viewer] = await Promise.all([getItems(), getViewer()]);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.toLowerCase();
  const type = searchParams.get('type');
  const subject = searchParams.get('subject');
  const place = searchParams.get('place');

  const result = items.filter((i) => {
    if (!canView(i, viewer)) return false;
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
  // Default to [] so the definite string[] type holds even though publicFields
  // is optional on Vocab — and [] is the correct fail-closed value: expose
  // nothing. (normalize() always fills it at runtime; this satisfies the type.)
  const { publicFields = [] } = await getVocab();
  return NextResponse.json(result.map((i) => publicView(i, publicFields)));
}
