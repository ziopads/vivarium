import Link from 'next/link';
import { getItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { CONDITIONS } from '@/lib/sections';
import VocabEditor from '@/app/ui/VocabEditor';

export const dynamic = 'force-dynamic';

export default async function VocabPage() {
  const vocab = await getVocab();
  const items = await getItems();

  const sections: Record<string, number> = {};
  const genres: Record<string, number> = {};
  const shelvesBySection: Record<string, Record<string, number>> = {};
  for (const i of items) {
    const sec = (i.section || '').trim();
    if (sec) sections[sec] = (sections[sec] || 0) + 1;
    for (const g of i.genres || []) genres[g] = (genres[g] || 0) + 1;
    const sh = (i.shelf || '').trim();
    if (sec && sh) {
      if (!shelvesBySection[sec]) shelvesBySection[sec] = {};
      shelvesBySection[sec][sh] = (shelvesBySection[sec][sh] || 0) + 1;
    }
  }
  const counts = { sections, genres, shelvesBySection };

  return (
    <div>
      <Link href="/admin" className="text-sm text-rust hover:underline">← admin</Link>
      <h1 className="mt-3 font-serif text-2xl">Vocabulary</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Sections and genres are flat lists; <strong>shelves are scoped to a section</strong> (pick a
        section to manage its shelves). Renaming a value updates every item using it; deleting one
        clears it from the items that had it. Condition grades are fixed, shown for reference.
      </p>
      <VocabEditor initial={vocab} counts={counts} conditions={CONDITIONS} />
    </div>
  );
}
