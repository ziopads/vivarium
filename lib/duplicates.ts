import type { Item } from './types';
import { needsWriteup } from './writeup';

/**
 * Finding the pairs where one record has the photographs and another has the
 * write-up.
 *
 * THE ASYMMETRY IS THE SAFETY MECHANISM. Candidates are only ever drawn from
 * two disjoint pools: records with images and no write-up (the pipeline's), and
 * records with a write-up and no images (the hand-entered ones). Genuine
 * duplicate copies — two Peter Rabbits, two Book of Kells editions — both came
 * through the photo pipeline, so both sit in the same pool and can never pair
 * with each other. The filter that makes the search cheap is also what stops it
 * proposing to merge two real books.
 */

export type MatchBasis = 'isbn' | 'title+author' | 'title';

export type Candidate = {
  /** The record that survives: the one with the images. */
  survivorId: number;
  /** The record that is absorbed and deleted: the one with the write-up. */
  loserId: number;
  basis: MatchBasis;
  key: string;
  /**
   * More than one record on one side matched this key. Never merge these
   * without looking — a multi-volume set or two copies of one title will land
   * here, and the right answer is a human one.
   */
  ambiguous: boolean;
};

const fold = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function hasImages(i: Item): boolean {
  return (i.images && i.images.length > 0) || !!i.image;
}

/**
 * A comparable ISBN, as ISBN-13. A printed 10 and a printed 13 for the same
 * book have to land on the same key or half the matches are missed.
 *
 * Nine-digit SBNs return null deliberately: by project convention they live in
 * `notes` and never in `isbn`, and treating a short string as an ISBN would
 * invent matches.
 */
export function isbnKey(raw: string | undefined): string | null {
  const s = (raw || '').toUpperCase().replace(/[^0-9X]/g, '');
  if (s.length === 13) return s;
  if (s.length === 10) {
    const core = '978' + s.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
    return core + ((10 - (sum % 10)) % 10);
  }
  return null;
}

export function titleKey(t: string): string {
  return fold(t)
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function authorKey(a: string): string {
  const cleaned = fold(a).replace(/\(.*?\)/g, '').split(/[;/&]/)[0].trim();
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

/** Years disagree only when both are present and differ. */
function yearsAgree(a: string, b: string): boolean {
  const x = (a || '').trim();
  const y = (b || '').trim();
  return !x || !y || x === y;
}

function index(list: Item[], key: (i: Item) => string | null): Map<string, Item[]> {
  const m = new Map<string, Item[]>();
  for (const i of list) {
    const k = key(i);
    if (!k) continue;
    const arr = m.get(k);
    if (arr) arr.push(i);
    else m.set(k, [i]);
  }
  return m;
}

export function findDuplicates(items: Item[]): Candidate[] {
  const photographed = items.filter((i) => hasImages(i) && needsWriteup(i));
  const writtenUp = items.filter((i) => !hasImages(i) && !needsWriteup(i));

  const bases: { basis: MatchBasis; key: (i: Item) => string | null }[] = [
    { basis: 'isbn', key: (i) => isbnKey(i.isbn) },
    {
      basis: 'title+author',
      key: (i) => {
        const t = titleKey(i.title);
        const a = authorKey(i.author);
        return t && a ? `${t}|${a}` : null;
      },
    },
    // Title alone catches the records where one side never got an author — 0471
    // and its kind. Weakest basis, so it runs last and only on what is left.
    { basis: 'title', key: (i) => titleKey(i.title) || null },
  ];

  const out: Candidate[] = [];
  const used = new Set<number>();

  for (const b of bases) {
    const A = index(photographed.filter((i) => !used.has(i.id)), b.key);
    const B = index(writtenUp.filter((i) => !used.has(i.id)), b.key);

    for (const [key, as] of A) {
      const bs = B.get(key);
      if (!bs) continue;
      const ambiguous = as.length > 1 || bs.length > 1;

      for (const a of as) {
        for (const l of bs) {
          if (b.basis !== 'isbn' && !yearsAgree(a.year, l.year)) continue;
          out.push({ survivorId: a.id, loserId: l.id, basis: b.basis, key, ambiguous });
        }
      }
      // Everything touched by this key is spent, matched or not, so a weaker
      // basis cannot propose the same records again under a different heading.
      for (const a of as) used.add(a.id);
      for (const l of bs) used.add(l.id);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/**
 * Fields the loser may supply. The survivor keeps everything it already has;
 * the loser fills only what is blank. `description` and `discussion` are the
 * point of the exercise — copying description alone would drop the researched
 * tier, which is the expensive half.
 *
 * Absent by design: id, images, image, cover, copyright. The survivor is the
 * record with the photographs and its image state is never touched.
 */
const FILL_STRINGS = [
  'title', 'author', 'publisher', 'placeOfPublication', 'year', 'edition',
  'printing', 'isbn', 'format', 'description', 'discussion', 'blurb',
  'inscription', 'condition', 'conditionNotes', 'location', 'owner', 'notes',
  'section', 'shelf', 'source', 'pricePaid',
] as const;

const FILL_LISTS = ['genres', 'subjects', 'places'] as const;

export type MergePlan = {
  patch: Record<string, any>;
  /** Field names the loser actually contributes — for the confirmation. */
  filled: string[];
};

/**
 * What merging `loser` into `survivor` would change. Returns the patch and the
 * list of fields it fills, so the UI can say what is about to happen rather
 * than asking for trust.
 */
export function mergePlan(survivor: Item, loser: Item): MergePlan {
  const patch: Record<string, any> = {};
  const filled: string[] = [];
  const s = survivor as Record<string, any>;
  const l = loser as Record<string, any>;

  for (const f of FILL_STRINGS) {
    const mine = typeof s[f] === 'string' ? s[f].trim() : '';
    const theirs = typeof l[f] === 'string' ? l[f].trim() : '';
    if (!mine && theirs) {
      patch[f] = l[f];
      filled.push(f);
    }
  }

  for (const f of FILL_LISTS) {
    const mine: string[] = Array.isArray(s[f]) ? s[f] : [];
    const theirs: string[] = Array.isArray(l[f]) ? l[f] : [];
    if (!mine.length && theirs.length) {
      patch[f] = theirs;
      filled.push(f);
    }
  }

  // signed is a fact about the physical copy, so a true on either side wins.
  if (!survivor.signed && loser.signed) {
    patch.signed = true;
    filled.push('signed');
  }
  if (!survivor.maine && loser.maine) {
    patch.maine = true;
    filled.push('maine');
  }
  // Visibility takes the more restrictive of the two: a record marked private
  // must not become public by being merged into.
  if (loser.visibility === 'restricted' && survivor.visibility !== 'restricted') {
    patch.visibility = 'restricted';
    filled.push('visibility');
  }

  // Provenance for the join itself, so the surviving record says where its
  // write-up came from.
  const prior: number[] = Array.isArray((s as any).mergedFrom) ? (s as any).mergedFrom : [];
  patch.mergedFrom = [...prior, loser.id];

  return { patch, filled };
}
