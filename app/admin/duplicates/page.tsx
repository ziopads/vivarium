import Link from 'next/link';
import { getItems } from '@/lib/data';
import { findDuplicates, mergePlan } from '@/lib/duplicates';
import { coverImage, imageUrl } from '@/lib/img';
import DuplicateReview, { type PairView } from '@/app/ui/DuplicateReview';

export const dynamic = 'force-dynamic';

export default async function Duplicates() {
  const items = await getItems();
  const byId = new Map(items.map((i) => [i.id, i]));
  const candidates = findDuplicates(items);

  const pairs: PairView[] = candidates.flatMap((c) => {
    const survivor = byId.get(c.survivorId);
    const loser = byId.get(c.loserId);
    if (!survivor || !loser) return [];
    const img = coverImage(survivor);
    const { filled } = mergePlan(survivor, loser);
    return [
      {
        basis: c.basis,
        key: c.key,
        ambiguous: c.ambiguous,
        yearsDiffer: c.yearsDiffer,
        filled,
        survivor: {
          id: survivor.id,
          title: survivor.title,
          author: survivor.author,
          year: survivor.year,
          publisher: survivor.publisher,
          isbn: survivor.isbn,
          thumb: img ? imageUrl(img, 'thumb') : null,
        },
        loser: {
          id: loser.id,
          title: loser.title,
          author: loser.author,
          year: loser.year,
          publisher: loser.publisher,
          isbn: loser.isbn,
          description: (loser.description || '').slice(0, 240),
        },
      },
    ];
  });

  return (
    <div>
      <Link href="/admin" className="text-sm text-rust hover:underline">
        ← admin
      </Link>
      <h1 className="mt-3 font-serif text-2xl">Duplicates</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Pairs where one record has photographs and another, apparently of the same book, has none.
        Merging fills the photographed record’s blank fields from the other — the write-up if there
        is one, and any shelving or notes it was given by hand — records the join, and deletes the
        other record. Two copies of the same book both came through the camera, so they are never
        proposed here.
      </p>
      <div className="mt-5">
        <DuplicateReview pairs={pairs} />
      </div>
    </div>
  );
}
