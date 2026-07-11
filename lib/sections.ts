import type { Item } from './types';

// Merge a couple of legacy shelf names into the bookstore section vocabulary.
const MERGE: Record<string, string> = {
  'Travel & Exploration': 'Travel',
  Maritime: 'Sailing',
};

// The single "aisle" a book belongs to. Colorado items carry `section`; older
// Maine items fall back to their shelf / first genre.
export function sectionOf(i: Item): string {
  const raw = (i.section || i.shelf || i.genres?.[0] || 'Unsorted').trim();
  return MERGE[raw] || raw || 'Unsorted';
}

// "Maine" is a cross-cutting aisle, not a single section: anything flagged
// maine, or with Maine in its subjects/places/title.
export function isMaine(i: Item): boolean {
  if (i.maine) return true;
  const hay = `${i.title} ${(i.subjects || []).join(' ')} ${(i.places || []).join(' ')}`;
  return /\bmaine\b/i.test(hay);
}

// Curated aisle order; anything unlisted sorts after, alphabetically.
export const SECTION_ORDER = [
  'Fiction', 'Poetry', 'Essays', 'Biography & Memoir', 'History', 'Philosophy',
  'Religion', 'Spirituality & Philosophy', 'Science', 'Nature', 'Animals', 'Art',
  'Photography', 'Music', 'Physical Culture & Sports', 'Sailing', 'Travel',
  "Children's", 'Languages', 'Craft & How-to', 'Reference',
];

// Locked controlled vocabularies for the /manage editor.
export const SECTIONS = [
  'Fiction', 'Poetry', 'Essays', 'Biography & Memoir', 'History', 'Philosophy',
  'Religion', 'Science', 'Nature', 'Animals', 'Art', 'Photography', 'Music',
  'Physical Culture & Sports', 'Sailing', 'Travel', "Children's", 'Languages',
  'Craft & How-to', 'Reference',
];

export const SHELVES = [
  'Art', 'Biography & Memoir', 'Craft & How-to', 'Essays', 'Fiction', 'History',
  'Maritime', 'Music', 'Nature', 'Poetry', 'Reference', 'Science',
  'Spirituality & Philosophy', 'Travel & Exploration',
];

// Standard used-book condition grades (AB/ABAA-style), best → worst.
export const CONDITIONS = [
  'As New', 'Fine', 'Near Fine', 'Very Good', 'Good', 'Fair', 'Poor',
];

export function orderedSections(items: Item[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const s = sectionOf(i);
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const rank = (n: string) => {
    const idx = SECTION_ORDER.indexOf(n);
    return idx === -1 ? SECTION_ORDER.length : idx;
  };
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}
