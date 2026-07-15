import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getItems, writeLocalItems } from '@/lib/data';
import { getVocab, writeVocab, type VocabKind } from '@/lib/vocab';

// POST /api/vocab  { kind, action, value, newValue?, section? }
// Shelf ops require `section` (shelves are scoped to a section). Renames cascade
// to items; deletes clear the value from items that had it. Admin-guarded by middleware.
export async function POST(req: Request) {
  // Persisted via writeLocalItems/writeVocab: Supabase when configured, else local JSON.
  let body: {
    kind?: VocabKind;
    action?: 'add' | 'rename' | 'delete';
    value?: string;
    newValue?: string;
    section?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { kind, action } = body;
  const value = (body.value || '').trim();
  const newValue = (body.newValue || '').trim();
  const section = (body.section || '').trim();
  if (!kind || !['sections', 'genres', 'shelves'].includes(kind)) {
    return NextResponse.json({ error: 'Unknown vocabulary kind' }, { status: 400 });
  }
  if (!action) return NextResponse.json({ error: 'No action' }, { status: 400 });

  const vocab = await getVocab();
  const items = await getItems();
  let affected = 0;

  const save = async () => {
    if (affected) await writeLocalItems(items);
    await writeVocab(vocab);
    revalidatePath('/');
    revalidatePath('/browse');
    revalidatePath('/admin/vocab');
    return NextResponse.json({ ok: true, vocab, affected });
  };

  // --- Genres (flat, cross-cutting) ---
  if (kind === 'genres') {
    const list = vocab.genres;
    if (action === 'add') {
      if (value && !list.includes(value)) list.push(value);
      return save();
    }
    if (!value) return NextResponse.json({ error: 'Empty value' }, { status: 400 });
    const idx = list.indexOf(value);
    if (action === 'rename') {
      if (!newValue) return NextResponse.json({ error: 'Need a new value' }, { status: 400 });
      if (idx !== -1) {
        if (list.includes(newValue)) list.splice(idx, 1);
        else list[idx] = newValue;
      }
      for (const it of items) {
        if (Array.isArray(it.genres) && it.genres.includes(value)) {
          it.genres = Array.from(new Set(it.genres.map((g) => (g === value ? newValue : g))));
          affected++;
        }
      }
    } else {
      if (idx !== -1) list.splice(idx, 1);
      for (const it of items) {
        if (Array.isArray(it.genres) && it.genres.includes(value)) {
          it.genres = it.genres.filter((g) => g !== value);
          affected++;
        }
      }
    }
    return save();
  }

  // --- Sections (also carry their shelf lists) ---
  if (kind === 'sections') {
    const list = vocab.sections;
    if (action === 'add') {
      if (value && !list.includes(value)) {
        list.push(value);
        if (!vocab.shelvesBySection[value]) vocab.shelvesBySection[value] = [];
      }
      return save();
    }
    if (!value) return NextResponse.json({ error: 'Empty value' }, { status: 400 });
    const idx = list.indexOf(value);
    if (action === 'rename') {
      if (!newValue) return NextResponse.json({ error: 'Need a new value' }, { status: 400 });
      if (idx !== -1) {
        if (list.includes(newValue)) list.splice(idx, 1);
        else list[idx] = newValue;
      }
      if (value !== newValue) {
        const moving = vocab.shelvesBySection[value] || [];
        const existing = vocab.shelvesBySection[newValue] || [];
        vocab.shelvesBySection[newValue] = Array.from(new Set([...existing, ...moving]));
        delete vocab.shelvesBySection[value];
      }
      for (const it of items) {
        if (it.section === value) {
          it.section = newValue;
          affected++;
        }
      }
    } else {
      if (idx !== -1) list.splice(idx, 1);
      delete vocab.shelvesBySection[value];
      for (const it of items) {
        if (it.section === value) {
          it.section = '';
          it.shelf = '';
          affected++;
        }
      }
    }
    return save();
  }

  // --- Shelves (scoped to a section) ---
  if (!section) return NextResponse.json({ error: 'Shelf changes need a section' }, { status: 400 });
  if (!vocab.shelvesBySection[section]) vocab.shelvesBySection[section] = [];
  const shelves = vocab.shelvesBySection[section];
  if (action === 'add') {
    if (value && !shelves.includes(value)) shelves.push(value);
    return save();
  }
  if (!value) return NextResponse.json({ error: 'Empty value' }, { status: 400 });
  const sidx = shelves.indexOf(value);
  if (action === 'rename') {
    if (!newValue) return NextResponse.json({ error: 'Need a new value' }, { status: 400 });
    if (sidx !== -1) {
      if (shelves.includes(newValue)) shelves.splice(sidx, 1);
      else shelves[sidx] = newValue;
    }
    for (const it of items) {
      if (it.section === section && it.shelf === value) {
        it.shelf = newValue;
        affected++;
      }
    }
  } else {
    if (sidx !== -1) shelves.splice(sidx, 1);
    for (const it of items) {
      if (it.section === section && it.shelf === value) {
        it.shelf = '';
        affected++;
      }
    }
  }
  return save();
}
