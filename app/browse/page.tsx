import Link from 'next/link';
import { getItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import Catalog from '@/app/ui/Catalog';

export const dynamic = 'force-dynamic';

export default async function Browse({
  searchParams,
}: {
  searchParams: { section?: string; q?: string };
}) {
  const items = await getItems();
  const vocab = getVocab();
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
          vocab={vocab}
        />
      </div>
    </div>
  );
}
