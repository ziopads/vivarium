import Link from 'next/link';
import { getVisibleItems } from '@/lib/data';
import { getVocab, flatShelves } from '@/lib/vocab';
import Catalog from '@/app/ui/Catalog';
import { getViewer } from '@/lib/auth';
import { sectionOf } from '@/lib/sections';
import { needsWriteup } from '@/lib/writeup';
import type { Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * What actually crosses the wire.
 *
 * Catalog is a client component, so every record it receives is serialized into
 * the RSC payload, transferred, parsed and hydrated. At 1,600 records the two
 * heaviest things in that payload are the discussion markdown (kilobytes each
 * across the written-up records) and the images array, of which the three views
 * use exactly one entry: the cover.
 *
 * Both are replaced here. `writeupDone` carries what the triangle needs;
 * `images` keeps the cover alone. Everything the list view edits — notes,
 * condition, location, subjects — stays, because those are typed into the
 * table.
 *
 * CONSEQUENCE: the browse search box no longer matches description text. It
 * matches title, author, publisher, genres, subjects and places.
 */
function forBrowsing(i: Item): Item {
  const cover = i.images?.find((im) => im.src === i.cover) || i.images?.[0];
  return {
    ...i,
    description: '',
    discussion: undefined,
    blurb: '',
    writeupDone: !needsWriteup(i),
    images: cover ? [cover] : [],
    cover: cover?.src,
  };
}

export default async function Browse({
  searchParams,
}: {
  searchParams: { section?: string; q?: string; shelf?: string };
}) {
  const items = await getVisibleItems();
  const vocab = await getVocab();
  const viewer = await getViewer();

  const section = searchParams.section;
  const shelf = searchParams.shelf;

  // Two-level browse: within a section, offer its shelves as chips.
  let chips: { name: string; count: number }[] = [];
  if (section) {
    const counts: Record<string, number> = {};
    for (const i of items) {
      if (sectionOf(i) !== section) continue;
      const sh = (i.shelf || '').trim();
      if (sh) counts[sh] = (counts[sh] || 0) + 1;
    }
    const names = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    chips = names.map((n) => ({ name: n, count: counts[n] }));
  }

  const chipCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${
      active ? 'border-rust bg-rust text-white' : 'border-line bg-card hover:border-rust'
    }`;

  return (
    <div>
      <Link href="/" className="text-sm text-rust hover:underline">
        ← sections
      </Link>

      {section && chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/browse?section=${encodeURIComponent(section)}`} className={chipCls(!shelf)}>
            All {section}
          </Link>
          {chips.map((c) => (
            <Link
              key={c.name}
              href={`/browse?section=${encodeURIComponent(section)}&shelf=${encodeURIComponent(c.name)}`}
              className={chipCls(shelf === c.name)}
            >
              {c.name}{' '}
              <span className={shelf === c.name ? 'text-white/70' : 'text-muted'}>({c.count})</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-3">
        <Catalog
          items={items.map(forBrowsing)}
          initialSection={section}
          initialQ={searchParams.q}
          initialShelf={shelf}
          vocab={{ sections: vocab.sections, genres: vocab.genres, shelves: flatShelves(vocab), shelvesBySection: vocab.shelvesBySection }}
          isAdmin={viewer.isAdmin}
        />
      </div>
    </div>
  );
}
