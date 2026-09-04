import type { Item } from './types';

/**
 * The single section a book is filed under.
 *
 * This used to read `i.section || i.shelf || i.genres?.[0] || 'Unsorted'`. The
 * fallback invented sections for books that had none: roughly 39 records showed
 * up on the landing page under names that are not in the vocabulary at all —
 * Art, Science, Biography & Memoir — because a GENRE carried that name. The
 * books it fabricated sections for were exactly the ones waiting to be sorted,
 * and the fabrication kept them out of the Unsorted pile, which is the one place
 * they would have been noticed.
 *
 * A MERGE map also rewrote two live vocabulary terms at display time
 * (Maritime → Sailing, Travel & Exploration → Travel), so the landing page,
 * /manage and /admin/vocab disagreed about what the sections were called.
 * Both are gone. Empty means unfiled, and now says so.
 *
 * If a section name still appears here that is absent from /admin/vocab, it is a
 * stale value stored on the items themselves and wants renaming there.
 */
export function sectionOf(i: Item): string {
  return (i.section || '').trim() || 'Unsorted';
}

// "Maine" is a cross-cutting aisle, not a single section: anything flagged
// maine, or with Maine in its subjects/places/title.
export function isMaine(i: Item): boolean {
  if (i.maine) return true;
  const hay = `${i.title} ${(i.subjects || []).join(' ')} ${(i.places || []).join(' ')}`;
  return /\bmaine\b/i.test(hay);
}

// Standard used-book condition grades (AB/ABAA-style), best → worst.
export const CONDITIONS = [
  'As New', 'Fine', 'Near Fine', 'Very Good', 'Good', 'Fair', 'Poor',
];

/**
 * Sections present in a set of items, with counts, in the vocabulary's own
 * order.
 *
 * `order` is the section list from the vocabulary — the sequence shown in
 * /admin/vocab. Three hardcoded arrays used to live here (SECTION_ORDER,
 * SECTIONS, SHELVES) naming a vocabulary two generations old; SECTION_ORDER
 * matched none of the current sections, so the curated ordering it existed to
 * provide silently did nothing and everything fell through to alphabetical.
 *
 * Anything not in `order` sorts after it, alphabetically — which puts Unsorted
 * last, and puts any stale stored section name beside it where it can be seen.
 */
export function orderedSections(
  items: Item[],
  order: string[] = [],
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const s = sectionOf(i);
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const rank = (n: string) => {
    const idx = order.indexOf(n);
    return idx === -1 ? order.length : idx;
  };
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}
