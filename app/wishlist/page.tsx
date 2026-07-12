import Link from 'next/link';
import { redirect } from 'next/navigation';
import wishlist from '@/data/wishlist.json';
import { getViewer } from '@/lib/auth';

type Want = {
  title: string;
  author: string;
  section: string;
  publisher?: string;
  year?: string;
  note?: string;
};

export const metadata = { title: 'Wishlist — Vivarium' };
export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  const { isAuthed } = await getViewer();
  if (!isAuthed) redirect('/login?next=/wishlist');
  const items = wishlist as Want[];

  // group by section
  const bySection = new Map<string, Want[]>();
  for (const w of items) {
    if (!bySection.has(w.section)) bySection.set(w.section, []);
    bySection.get(w.section)!.push(w);
  }
  const sections = Array.from(bySection.keys()).sort();
  for (const s of sections) {
    bySection.get(s)!.sort((a, b) => (a.author + a.title).localeCompare(b.author + b.title));
  }
  const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h1 className="font-serif text-3xl">Wishlist</h1>
        <Link href="/" className="text-sm text-rust hover:underline">
          ← catalog
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted">
        {items.length} books to find, grouped by section — {sections.length} sections.
      </p>

      {/* quick jump index for browsing in a store */}
      <nav className="mb-8 flex flex-wrap gap-2">
        {sections.map((s) => (
          <a
            key={s}
            href={`#${anchor(s)}`}
            className="rounded-full border border-line bg-card px-3 py-1 text-sm hover:border-rust"
          >
            {s} <span className="text-muted">({bySection.get(s)!.length})</span>
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        {sections.map((s) => (
          <section key={s} id={anchor(s)} className="scroll-mt-6">
            <h2 className="mb-3 border-b border-line pb-1 font-serif text-xl text-rust">{s}</h2>
            <ul className="divide-y divide-line">
              {bySection.get(s)!.map((w, i) => (
                <li key={i} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-lg leading-snug">{w.title}</span>
                    {w.year && <span className="shrink-0 text-xs text-muted">{w.year}</span>}
                  </div>
                  {w.author && <p className="mt-0.5 text-sm text-muted">{w.author}</p>}
                  {(w.publisher || w.note) && (
                    <p className="mt-0.5 text-xs text-muted">
                      {[w.publisher, w.note].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
