import Link from 'next/link';
import { getItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { CONDITIONS } from '@/lib/sections';
import type { Item } from '@/lib/types';
import VocabEditor from '@/app/ui/VocabEditor';

export const dynamic = 'force-dynamic';

export default async function VocabPage() {
  const vocab = await getVocab();
  const items = await getItems();

  const count = (pick: (i: Item) => string[] | string) => {
    const m: Record<string, number> = {};
    for (const i of items) {
      const v = pick(i);
      const vals = Array.isArray(v) ? v : v ? [v] : [];
      for (const x of vals) m[x] = (m[x] || 0) + 1;
    }
    return m;
  };
  const counts = {
    sections: count((i) => i.section || ''),
    genres: count((i) => i.genres || []),
    shelves: count((i) => i.shelf || ''),
  };

  return (
    <div>
      <Link href="/admin" className="text-sm text-rust hover:underline">← admin</Link>
      <h1 className="mt-3 font-serif text-2xl">Vocabulary</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        These values fill the section, genre and shelf dropdowns everywhere. Renaming a value updates
        every item using it; deleting one clears it from the items that had it. Condition grades are
        fixed and shown for reference.
      </p>
      <VocabEditor initial={vocab} counts={counts} conditions={CONDITIONS} />
    </div>
  );
}
