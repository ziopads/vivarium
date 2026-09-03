import Link from 'next/link';
import NewItemButton from '@/app/ui/NewItemButton';

export const dynamic = 'force-dynamic';

const links: { href?: string; title: string; desc: string; soon?: boolean }[] = [
  {
    href: '/manage',
    title: 'Tag items',
    desc: 'Assign section, shelf, genres and subjects per item — with bulk section-assign for clearing the backlog.',
  },
  {
    href: '/admin/vocab',
    title: 'Edit vocabulary',
    desc: 'Add, rename or remove the section / genre / shelf values that fill the dropdowns.',
  },
  {
    href: '/admin/duplicates',
    title: 'Merge duplicates',
    desc: 'Pairs where one record has the photographs and another has the write-up. Merging keeps the photographed record and absorbs the other.',
  },
  {
    href: '/browse',
    title: 'Browse catalogue',
    desc: 'The reader-facing catalogue, including the wide inline-edit list view.',
  },
];

export default function Admin() {
  return (
    <div>
      <Link href="/" className="text-sm text-rust hover:underline">← home</Link>
      <h1 className="mt-3 font-serif text-2xl">Admin</h1>
      <p className="mt-1 text-sm text-muted">Behind-the-scenes tools — not part of the public catalogue.</p>
      <div className="mt-4">
        <NewItemButton />
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {links.map((l) => {
          const body = (
            <>
              <p className="font-serif text-lg">
                {l.title}
                {l.soon && <span className="ml-2 align-middle text-xs text-muted">(next)</span>}
              </p>
              <p className="mt-1 text-sm text-muted">{l.desc}</p>
            </>
          );
          return (
            <li key={l.title}>
              {l.href ? (
                <Link
                  href={l.href}
                  className="block h-full rounded-lg border border-line bg-card px-4 py-3 transition hover:border-rust hover:shadow-sm"
                >
                  {body}
                </Link>
              ) : (
                <div className="block h-full rounded-lg border border-dashed border-line bg-card/50 px-4 py-3 opacity-70">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
