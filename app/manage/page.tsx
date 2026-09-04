import Link from 'next/link';
import { getItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { coverImage, imageUrl } from '@/lib/img';
import ManageTable from '@/app/ui/ManageTable';

export const dynamic = 'force-dynamic';

export default async function Manage() {
  const items = await getItems();
  const vocab = await getVocab();
  const rows = items.map((i) => {
    // Resolved here rather than in the client: the tier logic and the R2 prefix
    // belong on the server, and the row then carries one short string instead of
    // the whole images array for every record in the catalogue.
    const cover = coverImage(i);
    return {
      id: i.id,
      title: i.title,
      thumb: cover ? imageUrl(cover, 'thumb') : '',
      section: i.section || '',
      shelf: i.shelf || '',
      genres: i.genres || [],
      subjects: i.subjects || [],
    };
  });
  const subjectSuggest = Array.from(new Set(items.flatMap((i) => i.subjects || []))).sort();

  return (
    <div>
      <Link href="/admin" className="text-sm text-rust hover:underline">← admin</Link>
      <h1 className="mt-3 font-serif text-2xl">Tag items</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Section and shelf are locked to the managed vocabulary — no free-typing new ones. Filter to
        “Unsorted” to assign sections to the books that lack one, or “Unshelved” to work through
        those that have a section but no shelf. Tick several rows to set section and shelf together.
        Shelves are scoped to their section, so with no section chosen the shelf filter matches a
        name wherever it appears. Everything saves as you go. Hover a thumbnail to enlarge it.
      </p>
      <div className="mt-5">
        <ManageTable
          rows={rows}
          sections={vocab.sections}
          shelvesBySection={vocab.shelvesBySection}
          genreSuggest={vocab.genres}
          subjectSuggest={subjectSuggest}
        />
      </div>
    </div>
  );
}
