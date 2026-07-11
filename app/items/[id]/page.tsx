import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem, getItems } from '@/lib/data';
import Gallery from '@/app/ui/Gallery';
import MetaEditor from '@/app/ui/MetaEditor';
import Discussion from '@/app/ui/Discussion';
import ItemActions from '@/app/ui/ItemActions';
import ItemNav from '@/app/ui/ItemNav';
import { getViewer } from '@/lib/auth';
import { imgUrl } from '@/lib/img';
import TypeFieldsEditor from '@/app/ui/TypeFieldsEditor';
import { typeFields } from '@/lib/itemTypes';

// Render on-demand so a cover change (writing items.json) shows up on refresh.
export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  const items = await getItems();
  return items.map((i) => ({ id: String(i.id) }));
}

export default async function ItemPage({ params }: { params: { id: string } }) {
  const item = await getItem(Number(params.id));
  if (!item) notFound();

  const viewer = await getViewer();
  if (item.visibility === 'restricted' && !viewer.isAuthed) notFound();

  const all = await getItems();
  const allShelves = Array.from(new Set(all.map((i) => i.shelf).filter(Boolean))).sort();
  const allGenres = Array.from(new Set(all.flatMap((i) => i.genres))).sort();

  const rows: [string, string][] = (
    [
      ['Type', item.itemType],
      ['Author / Maker', item.author],
      ['Publisher', item.publisher],
      ['Place of publication', item.placeOfPublication],
      ['Year', item.year],
      ['Edition', item.edition],
      ['Printing', item.printing],
      ['ISBN', item.isbn],
      ['Format', item.format],
      ['Shelf', item.shelf],
      ['Condition', item.condition],
      ['Condition notes', item.conditionNotes || ''],
      ['Location', item.location],
      ...typeFields(item.itemType).map(
        (f) => [f.label, String((item as Record<string, any>)[f.key] || '')] as [string, string],
      ),
    ] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <article className="max-w-3xl">
      <Link href="/browse" className="text-sm text-rust hover:underline">
        ← back to catalog
      </Link>
      <ItemNav itemId={item.id} />
      <p className="mt-4 font-mono text-xs text-muted">#{String(item.id).padStart(6, '0')}</p>
      <h1 className="mt-1 font-serif text-3xl leading-tight">{item.title}</h1>
      {item.author && <p className="mt-1 text-lg text-muted">{item.author}</p>}
      {item.signed && (
        <p className="mt-3 inline-block rounded-full bg-rust/10 px-3 py-1 text-sm text-rust">
          Signed / inscribed
        </p>
      )}
      {item.visibility === 'restricted' && (
        <p className="mt-3 ml-2 inline-block rounded-full bg-moss/10 px-3 py-1 text-sm text-moss">
          🔒 Private
        </p>
      )}

      {item.images && item.images.length > 0 ? (
        <Gallery images={item.images} title={item.title} itemId={item.id} copyrightSrc={item.copyright} editable={viewer.isAdmin} />
      ) : (
        item.image && (
          <img
            src={imgUrl(item.image)}
            alt={item.title}
            className="mt-6 max-h-[28rem] w-auto rounded shadow-sm"
          />
        )
      )}

      {item.description && (
        <p className="mt-6 max-w-prose font-serif leading-relaxed text-ink/90">{item.description}</p>
      )}
      {item.discussion && (
        <details className="group mt-4 max-w-prose">
          <summary className="cursor-pointer list-none text-sm text-rust marker:content-none hover:underline">
            <span className="group-open:hidden">more…</span>
            <span className="hidden group-open:inline">less ▴</span>
          </summary>
          <div className="mt-3 border-l-2 border-line pl-4 text-sm text-ink/80">
            <Discussion md={item.discussion} />
          </div>
        </details>
      )}

      <dl className="mt-6 space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[10rem_1fr] gap-2">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {viewer.isAdmin && (
        <MetaEditor
          itemId={item.id}
          shelf={item.shelf}
          genres={item.genres}
          subjects={item.subjects}
          allShelves={allShelves}
          allGenres={allGenres}
        />
      )}
      {viewer.isAdmin && (
        <TypeFieldsEditor
          itemId={item.id}
          itemType={item.itemType}
          values={Object.fromEntries(
            typeFields(item.itemType).map((f) => [f.key, String((item as Record<string, any>)[f.key] || '')]),
          )}
        />
      )}
      {item.places.length > 0 && <Tags label="Places" values={item.places} />}

      {item.inscription && (
        <blockquote className="mt-6 border-l-2 border-rust/40 pl-4 font-serif italic text-ink/90">
          {item.inscription}
        </blockquote>
      )}
      {item.notes && <p className="mt-6 text-sm text-muted">{item.notes}</p>}

      <ItemNav itemId={item.id} />
      {viewer.isAdmin && <ItemActions itemId={item.id} visibility={item.visibility} />}
    </article>
  );
}

function Tags({
  label,
  values,
  accent = false,
}: {
  label: string;
  values: string[];
  accent?: boolean;
}) {
  const cls = accent ? 'bg-rust/10 text-rust' : 'bg-moss/10 text-moss';
  return (
    <div className="mt-5">
      <p className="mb-1 text-sm text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className={`rounded px-2 py-0.5 text-xs ${cls}`}>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
