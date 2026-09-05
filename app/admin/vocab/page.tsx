import Link from 'next/link';
import { getItems } from '@/lib/data';
import { getVocab } from '@/lib/vocab';
import { CONDITIONS } from '@/lib/sections';
import { parsePath } from '@/lib/taxonomy';
import VocabEditor from '@/app/ui/VocabEditor';

export const dynamic = 'force-dynamic';

export default async function VocabPage() {
  const vocab = await getVocab();
  const items = await getItems();

  const sections: Record<string, number> = {};
  const genres: Record<string, number> = {};
  const types: Record<string, number> = {};
  const shelvesBySection: Record<string, Record<string, number>> = {};
  // Keyed by joined path, at EVERY depth, and rolled up: a book at A/B/C counts
  // at A, at A/B and at A/B/C, so a parent's number covers everything beneath
  // it and the columns read the way a file browser does.
  //
  // These used to come from `section` and `shelf`, which meant nothing below the
  // second level could ever show a number — and that limitation was written into
  // the editor's help text as though it were a rule about what could be filed.
  // `classification` is the record's full path, so the limit is gone.
  const byPath: Record<string, number> = {};
  for (const i of items) {
    const sec = (i.section || '').trim();
    if (sec) sections[sec] = (sections[sec] || 0) + 1;
    for (const g of i.genres || []) genres[g] = (genres[g] || 0) + 1;
    const t = (i.itemType || 'Book').trim();
    types[t] = (types[t] || 0) + 1;
    const sh = (i.shelf || '').trim();
    if (sec && sh) {
      if (!shelvesBySection[sec]) shelvesBySection[sec] = {};
      shelvesBySection[sec][sh] = (shelvesBySection[sec][sh] || 0) + 1;
    }
    const segs = parsePath(i.classification || '');
    for (let n = 1; n <= segs.length; n++) {
      const key = segs.slice(0, n).join('/');
      byPath[key] = (byPath[key] || 0) + 1;
    }
  }
  const counts = { sections, genres, types, shelvesBySection, byPath };

  return (
    <div>
      <Link href="/admin" className="text-sm text-rust hover:underline">← admin</Link>
      <h1 className="mt-3 font-serif text-2xl">Vocabulary</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        The classification is one tree. A section is a top-level entry and a shelf is its child, but
        nothing stops you nesting further — a group of regions under a section, periods under that.
        Renaming an entry updates every item using it; deleting one takes its children with it and
        clears the value from the items that had it. Genres stay a flat list, since they cut across
        the tree. Condition grades are fixed, shown for reference.
      </p>
      <VocabEditor initial={vocab} counts={counts} conditions={CONDITIONS} />
    </div>
  );
}
