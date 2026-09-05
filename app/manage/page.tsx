import Link from 'next/link';
import { getItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { coverImage, imageUrl } from '@/lib/img';
import { pathOptions, pathOptionsByType } from '@/lib/taxonomy';
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
      itemType: i.itemType || 'Book',
      thumb: cover ? imageUrl(cover, 'thumb') : '',
      classification: i.classification || '',
      genres: i.genres || [],
      subjects: i.subjects || [],
    };
  });
  const subjectSuggest = Array.from(new Set(items.flatMap((i) => i.subjects || []))).sort();

  // The managed list, plus whatever is already in use — so a type set by hand or
  // by the pipeline never vanishes from the picker showing it.
  const types = Array.from(new Set([...vocab.types, ...items.map((i) => i.itemType || 'Book')]));

  return (
    <div>
      <Link href="/admin" className="text-sm text-rust hover:underline">← admin</Link>
      <h1 className="mt-3 font-serif text-2xl">Tag items</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Filing is one place in the classification tree, chosen from the picker — no free-typing,
        and each row is offered only the branches its own type is served by.
        Filter to “Unfiled” to work through what has no place yet, or pick a branch to see
        everything under it. Tick several rows to file or retype them together. Type is what the
        object IS — a book, a recording, a frame — and decides which extra fields the item page
        offers. A row marked ⚠ is filed somewhere its type is not served by: nothing is lost, but
        no picker will offer that place back to it. Everything saves as you go. Hover a thumbnail
        to enlarge it.
      </p>
      <div className="mt-5">
        <ManageTable
          rows={rows}
          // Two lists, and they are not interchangeable. `paths` is every path in
          // the tree, for the filter and the bulk bar — both of which act over a
          // mixed set of types and have no single item in hand. `pathsByType`
          // scopes each ROW's picker to the branches that row's type is served by.
          paths={pathOptions(vocab.tree)}
          pathsByType={pathOptionsByType(vocab.tree, types)}
          // The tree itself, so the mis-filing flag can be recomputed in the
          // browser. Computing it here would go stale the moment a row is
          // retyped, which is the exact edit that creates a mis-filing.
          tree={vocab.tree}
          genreSuggest={vocab.genres}
          subjectSuggest={subjectSuggest}
          types={types}
        />
      </div>
    </div>
  );
}
