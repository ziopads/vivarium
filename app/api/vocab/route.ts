import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';
import { getVocab, writeVocab, type VocabKind } from '@/lib/vocab';

// POST /api/vocab  { kind, action: 'add'|'rename'|'delete', value, newValue? }
// Renames cascade to items; deletes clear the value from items that had it.
export async function POST(req: Request) {
  if (process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Editing is available only against the local JSON store.' }, { status: 400 });
  }
  let body: { kind?: VocabKind; action?: 'add' | 'rename' | 'delete'; value?: string; newValue?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const kind = body.kind;
  const action = body.action;
  const value = (body.value || '').trim();
  const newValue = (body.newValue || '').trim();
  if (!kind || !['sections', 'genres', 'shelves'].includes(kind)) {
    return NextResponse.json({ error: 'Unknown vocabulary kind' }, { status: 400 });
  }

  const vocab = await getVocab();
  const list = vocab[kind];
  let affected = 0;

  if (action === 'add') {
    if (!value) return NextResponse.json({ error: 'Empty value' }, { status: 400 });
    if (!list.includes(value)) list.push(value);
    await writeVocab(vocab);
    revalidatePath('/admin/vocab');
    return NextResponse.json({ ok: true, vocab, affected: 0 });
  }

  if (action === 'rename' || action === 'delete') {
    if (!value) return NextResponse.json({ error: 'Empty value' }, { status: 400 });
    if (action === 'rename' && !newValue) {
      return NextResponse.json({ error: 'Need a new value' }, { status: 400 });
    }

    const idx = list.indexOf(value);
    if (action === 'rename') {
      if (idx === -1) return NextResponse.json({ error: 'Value not found' }, { status: 404 });
      if (list.includes(newValue)) list.splice(idx, 1); // merge into existing
      else list[idx] = newValue;
    } else if (idx !== -1) {
      list.splice(idx, 1);
    }

    const target = action === 'rename' ? newValue : '';
    const items = await getItems();
    for (const it of items) {
      if (kind === 'sections' && it.section === value) {
        it.section = target;
        affected++;
      } else if (kind === 'shelves' && it.shelf === value) {
        it.shelf = target;
        affected++;
      } else if (kind === 'genres' && Array.isArray(it.genres) && it.genres.includes(value)) {
        it.genres =
          action === 'rename'
            ? Array.from(new Set(it.genres.map((g) => (g === value ? newValue : g))))
            : it.genres.filter((g) => g !== value);
        affected++;
      }
    }
    if (affected) await writeLocalItems(items);
    await writeVocab(vocab);
    revalidatePath('/');
    revalidatePath('/browse');
    revalidatePath('/admin/vocab');
    return NextResponse.json({ ok: true, vocab, affected });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
