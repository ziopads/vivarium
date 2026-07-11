import { NextResponse } from 'next/server';
import { getItem } from '@/lib/data';

// GET /api/items/:id  (read-only)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const item = await getItem(Number(params.id));
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}
