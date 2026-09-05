import Link from 'next/link';
import { getVisibleItems } from '@/lib/data';
import { getVocab, flatShelves } from '@/lib/vocab';
import Catalog from '@/app/ui/Catalog';
import { getViewer } from '@/lib/auth';
import { sectionOf } from '@/lib/sections';
import { childrenAt, parsePath, formatPath, isUnderPath, pathOptionsByType } from '@/lib/taxonomy';
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
  searchParams: { section?: string; q?: string; shelf?: string; path?: string };
}) {
  const items = await getVisibleItems();
  const vocab = await getVocab();
  const viewer = await getViewer();

  const section = searchParams.section;
  const shelf = searchParams.shelf;

  // PATH MODE. `?path=` browses the classification tree at any depth, where
  // `?section=`/`?shelf=` reach only the first two levels. Both are live: the
  // landing page and the old chips still link the two-level way, and a path link
  // (from an item's breadcrumb) takes over when present.
  //
  // Scoping happens here rather than in Catalog because a prefix match is a
  // server-side filter over one field — Catalog receives the subtree already
  // narrowed and needs to know nothing about paths.
  const crumbs = parsePath(searchParams.path);
  const atPath = formatPath(crumbs);
  const scoped = crumbs.length
    ? items.filter((i) => isUnderPath(i.classification || '', atPath))
    : items;

  // Children of the current node, counted INCLUSIVELY — a chip shows everything
  // beneath it, so the numbers add up to the total above them rather than
  // omitting whatever sits directly on each child.
  const childChips = crumbs.length
    ? childrenAt(vocab.tree, crumbs).map((n) => {
        const p = formatPath([...crumbs, n.name]);
        return {
          name: n.name,
          path: p,
          count: scoped.filter((i) => isUnderPath(i.classification || '', p)).length,
        };
      })
    : [];

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

  // Pickable paths for the list view's filing control, one set per item type.
  // Built here rather than in the client: the tree is a single vocabulary row on
  // the server, and computing it per row in the browser would repeat the walk
  // once for every record on screen. The types actually in use are unioned with
  // the managed list, so a type set by hand or by the pipeline still gets a
  // picker rather than an empty one.
  const pathsByType = pathOptionsByType(vocab.tree, [
    ...vocab.types,
    ...items.map((i) => i.itemType || 'Book'),
  ]);

  const chipCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${
      active ? 'border-rust bg-rust text-white' : 'border-line bg-card hover:border-rust'
    }`;

  return (
    <div>
      <Link href="/" className="text-sm text-rust hover:underline">
        ← sections
      </Link>

      {crumbs.length > 0 && (
        <>
          <nav className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
            <Link href="/browse" className="text-rust hover:underline">
              All
            </Link>
            {crumbs.map((seg, i) => (
              <span key={seg + i} className="flex items-center gap-1.5">
                <span className="text-muted">›</span>
                {i === crumbs.length - 1 ? (
                  <span className="font-medium">{seg}</span>
                ) : (
                  <Link
                    href={`/browse?path=${encodeURIComponent(formatPath(crumbs.slice(0, i + 1)))}`}
                    className="text-rust hover:underline"
                  >
                    {seg}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          {childChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {childChips.map((c) => (
                <Link key={c.path} href={`/browse?path=${encodeURIComponent(c.path)}`} className={chipCls(false)}>
                  {c.name} <span className="text-muted">({c.count})</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {!crumbs.length && section && chips.length > 0 && (
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
          // Remount when the URL parameters change.
          //
          // Catalog reads initialSection/initialQ/initialShelf in a mount-only
          // effect. Clicking a shelf chip is a client-side navigation to the same
          // route, so React keeps the component mounted, the new props arrive and
          // nothing reads them — the chip highlighted, the count stayed at the
          // section total, and the cards never filtered. Keying on the params
          // forces a fresh mount, and view/sort survive because those are read
          // from sessionStorage on mount rather than from props.
          key={`${searchParams.path ?? ''}|${section ?? ''}|${shelf ?? ''}|${searchParams.q ?? ''}`}
          items={scoped.map(forBrowsing)}
          initialSection={crumbs.length ? undefined : section}
          initialQ={searchParams.q}
          initialShelf={crumbs.length ? undefined : shelf}
          vocab={{ sections: vocab.sections, genres: vocab.genres, shelves: flatShelves(vocab), shelvesBySection: vocab.shelvesBySection }}
          pathsByType={pathsByType}
          isAdmin={viewer.isAdmin}
        />
      </div>
    </div>
  );
}
