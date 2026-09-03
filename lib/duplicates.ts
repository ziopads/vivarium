import type { Item } from './types';

/**
 * Finding the pairs where one record has photographs and another doesn't.
 *
 * THE ASYMMETRY IS THE SAFETY MECHANISM, and it is about images alone.
 * Candidates are drawn from two disjoint pools: records with images, and
 * records without. Genuine duplicate copies — two Peter Rabbits, two Book of
 * Kells editions — both came through the photo pipeline, so both sit in the
 * pool with images and can never pair with each other.
 *
 * An earlier version also required the unphotographed side to carry a write-up,
 * on the assumption that the older hand-entered records always had one. They
 * don't, and pairs like 001183/001858 were invisible because of it. Write-up
 * state has nothing to do with whether two records are the same book.
 */

export type MatchBasis =
  | 'isbn'
  | 'title+author'
  | 'short title+author'
  | 'title'
  | 'short title'
  | 'volumeless title';

export type Candidate = {
  /** The record that survives: the one with the images. */
  survivorId: number;
  /** The record that is absorbed and deleted: the one without images. */
  loserId: number;
  basis: MatchBasis;
  key: string;
  /**
   * More than one record on one side matched this key. Never merge these
   * without looking — a multi-volume set, or two editions where only one was
   * photographed, will land here, and the right answer is a human one.
   */
  ambiguous: boolean;
  /** Both sides print a year and the years differ. A signal, never a veto. */
  yearsDiffer: boolean;
};

/**
 * Apostrophes and the Hawaiian ʻokina are dropped rather than turned into word
 * breaks, so "Don't" folds onto "Dont" and "Hawai'i" onto "Hawaii". An
 * ampersand becomes the word: "Opera & Its Symbols" and "Opera and its Symbols"
 * are the same book typed twice.
 */
const fold = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2018\u2019\u02bb\u02bc`]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase();

export function hasImages(i: Item): boolean {
  return (i.images && i.images.length > 0) || !!i.image;
}

/**
 * A comparable ISBN, as ISBN-13, so a printed 10 and a printed 13 for one book
 * land on one key. Nine-digit SBNs return null deliberately: by project
 * convention they live in `notes`, never in `isbn`.
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

/**
 * Title up to the first colon, bracket or spaced dash. A record read off a
 * cover often stops at the main title where the catalogued record carries the
 * whole thing — "The Goblin's Glen" against "The Goblin's Glen: A Story of
 * Childhood's Wonderland".
 */
export function shortTitleKey(t: string): string {
  return titleKey(String(t || '').split(/[:(\[]|\s[-\u2013\u2014]\s/)[0]);
}

/**
 * Short title with volume and set markers removed, so "Wonders of the Past,
 * vol. 1 (2-volume set)" reaches "wonders of the past".
 *
 * This is the tier most likely to be wrong, because collapsing volumes is
 * exactly what makes a set look like duplicates. It runs last, and a set will
 * usually trip the ambiguous flag anyway by matching more than one record on a
 * side.
 */
export function volumelessKey(t: string): string {
  return shortTitleKey(t)
    .replace(/\b\d+\s*volume\s*set\b/g, ' ')
    .replace(/\b(vol|volume|part|bk|book)\s*[ivxlcdm\d]+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Surname of the first named person. Splits on commas and "and" as well as
 * semicolons and slashes, because the same book is credited both ways:
 * "Joseph Allen; designed by Don and Debra McQuiston" against "Joseph Allen,
 * Don McQuiston, Debra McQuiston and Marshall Harrington". Taking the last word
 * of the whole string gave "allen" for one and "harrington" for the other.
 */
export function authorKey(a: string): string {
  const first = fold(a)
    .replace(/\(.*?\)/g, '')
    .split(/[;/,]|\sand\s/)[0]
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();
  const parts = first.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function yearsDiffer(a: string, b: string): boolean {
  const x = (a || '').trim();
  const y = (b || '').trim();
  return !!x && !!y && x !== y;
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
  const photographed = items.filter(hasImages);
  const unphotographed = items.filter((i) => !hasImages(i));

  const withAuthor = (t: (i: Item) => string) => (i: Item) => {
    const title = t(i);
    const a = authorKey(i.author);
    return title && a ? `${title}|${a}` : null;
  };

  // Strongest first. Each pass sees only what earlier ones left alone, so a
  // pair found by ISBN is never proposed again on a weaker basis.
  const bases: { basis: MatchBasis; key: (i: Item) => string | null }[] = [
    { basis: 'isbn', key: (i) => isbnKey(i.isbn) },
    { basis: 'title+author', key: withAuthor(titleKey) },
    { basis: 'short title+author', key: withAuthor(shortTitleKey) },
    // Author is dropped from here down. The same book gets credited to
    // different people — "Andrew Yeth: The Helga Pictures" is filed under Wyeth
    // on one record and under Wilmerding, who wrote it, on the other.
    { basis: 'title', key: (i) => titleKey(i.title) || null },
    { basis: 'short title', key: (i) => shortTitleKey(i.title) || null },
    { basis: 'volumeless title', key: (i) => volumelessKey(i.title) || null },
  ];

  const out: Candidate[] = [];
  const used = new Set<number>();

  for (const b of bases) {
    const A = index(photographed.filter((i) => !used.has(i.id)), b.key);
    const B = index(unphotographed.filter((i) => !used.has(i.id)), b.key);

    for (const [key, as] of A) {
      const bs = B.get(key);
      if (!bs) continue;
      const ambiguous = as.length > 1 || bs.length > 1;

      for (const a of as) {
        for (const l of bs) {
          // A differing year is reported, not used to reject. Two printings of
          // one work — Prairie Owl at 2006 and 2007, The Rise of the Gothic at
          // 1985 and 1988 — are exactly the pairs worth merging, and an earlier
          // version threw them away.
          out.push({
            survivorId: a.id,
            loserId: l.id,
            basis: b.basis,
            key,
            ambiguous,
            yearsDiffer: yearsDiffer(a.year, l.year),
          });
        }
      }
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
 * the loser fills only what is blank. That covers the write-up when there is
 * one — description AND discussion, since copying description alone would drop
 * the researched tier — and equally the shelving an older record was given by
 * hand: section, shelf, genres, location.
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

  const prior: number[] = Array.isArray((s as any).mergedFrom) ? (s as any).mergedFrom : [];
  patch.mergedFrom = [...prior, loser.id];

  return { patch, filled };
}
