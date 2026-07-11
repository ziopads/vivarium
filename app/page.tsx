import Link from 'next/link';
import { getItems } from '@/lib/data';
import { orderedSections, isMaine } from '@/lib/sections';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const items = await getItems();
  const sections = orderedSections(items);
  const maineCount = items.filter(isMaine).length;

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted">{items.length} items · browse by section</p>
          <Link href="/admin" className="text-xs text-muted hover:text-rust">
            admin
          </Link>
        </div>
        <form action="/browse" method="get" className="mt-3 flex max-w-xl gap-2">
          <input
            name="q"
            placeholder="Search the whole catalogue…"
            className="flex-1 rounded-md border border-line bg-card px-3 py-2 outline-none focus:border-rust"
          />
          <button className="rounded-md bg-rust px-4 py-2 text-sm text-white">Search</button>
        </form>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <li key={s.name}>
            <Link
              href={`/browse?section=${encodeURIComponent(s.name)}`}
              className="flex items-baseline justify-between rounded-lg border border-line bg-card px-4 py-3 transition hover:border-rust hover:shadow-sm"
            >
              <span className="font-serif text-lg">{s.name}</span>
              <span className="text-xs text-muted">{s.count}</span>
            </Link>
          </li>
        ))}
        {maineCount > 0 && (
          <li>
            <Link
              href="/browse?section=Maine"
              className="flex items-baseline justify-between rounded-lg border border-moss/40 bg-moss/5 px-4 py-3 transition hover:border-moss hover:shadow-sm"
            >
              <span className="font-serif text-lg">Maine</span>
              <span className="text-xs text-muted">{maineCount}</span>
            </Link>
          </li>
        )}
        <li>
          <Link
            href="/browse"
            className="flex items-baseline justify-between rounded-lg border border-rust/40 bg-rust/5 px-4 py-3 transition hover:border-rust hover:shadow-sm"
          >
            <span className="font-serif text-lg">All</span>
            <span className="text-xs text-muted">{items.length}</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
