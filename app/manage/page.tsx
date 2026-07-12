import Link from 'next/link';
import { getItems } from '@/lib/data';
import { getVocab, flatShelves } from '@/lib/vocab';
import ManageTable from '@/app/ui/ManageTable';

export const dynamic = 'force-dynamic';

export default async function Manage() {
  const items = await getItems();
  const vocab = await getVocab();
  const rows = items.map((i) => ({
    id: i.id,
    title: i.title,
    section: i.section || '',
    shelf: i.shelf || '',
    genres: i.genres || [],
    subjects: i.subjects || [],
  }));
  const subjectSuggest = Array.from(new Set(items.flatMap((i) => i.subjects || []))).sort();

  return (
    <div>
      <Link href="/admin" className="text-sm text-rust hover:underline">← admin</Link>
      <h1 className="mt-3 font-serif text-2xl">Tag items</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Section and shelf are locked to the managed vocabulary — no free-typing new ones. Filter to
        “Unsorted” to assign sections to the books that lack one, or tick several rows and set them
        all at once. Everything saves as you go.
      </p>
      <div className="mt-5">
        <ManageTable
          rows={rows}
          sections={vocab.sections}
          shelves={flatShelves(vocab)}
          genreSuggest={vocab.genres}
          subjectSuggest={subjectSuggest}
        />
      </div>
    </div>
  );
}
