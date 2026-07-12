import Link from 'next/link';
import { getVisibleItems } from '@/lib/data';
import { getVocab, flatShelves } from '@/lib/vocab';
import Catalog from '@/app/ui/Catalog';
import { getViewer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Browse({
  searchParams,
}: {
  searchParams: { section?: string; q?: string };
}) {
  const items = await getVisibleItems();
  const vocab = await getVocab();
  const viewer = await getViewer();
  return (
    <div>
      <Link href="/" className="text-sm text-rust hover:underline">
        ← sections
      </Link>
      <div className="mt-3">
        <Catalog
          items={items}
          initialSection={searchParams.section}
          initialQ={searchParams.q}
          vocab={{ sections: vocab.sections, genres: vocab.genres, shelves: flatShelves(vocab) }}
          isAdmin={viewer.isAdmin}
        />
      </div>
    </div>
  );
}
