import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem, getItems } from '@/lib/data';
import Gallery from '@/app/ui/Gallery';
import MetaEditor from '@/app/ui/MetaEditor';
import Discussion from '@/app/ui/Discussion';
import ItemActions from '@/app/ui/ItemActions';
import ItemNav from '@/app/ui/ItemNav';
import { getViewer } from '@/lib/auth';
import { coverImage, imageUrl } from '@/lib/img';
import TypeFieldsEditor from '@/app/ui/TypeFieldsEditor';
import AddItemPhotos from '@/app/ui/AddItemPhotos';
import TitleEditor from '@/app/ui/TitleEditor';
import DetailsEditor from '@/app/ui/DetailsEditor';
import EditMode from '@/app/ui/EditMode';
import { typeFields } from '@/lib/itemTypes';
import { getVocab } from '@/lib/vocab';
import { publicView } from '@/lib/fieldVisibility';

// Render on-demand so a cover change (writing items.json) shows up on refresh.
export const dynamic = 'force-dynamic';

export default async function ItemPage({ params }: { params: { id: string } }) {
  const item = await getItem(Number(params.id));
  if (!item) notFound();

  const viewer = await getViewer();
  if (item.visibility === 'restricted' && !viewer.isAdmin) notFound();

  // Non-admins see only the fields currently on the public allowlist. Enforced
  // here as well as in /api/items, because this page renders type-field values
  // (which include price, provenance, sale history) directly into the table.
  const visible = viewer.isAdmin ? item : publicView(item, (await getVocab()).publicFields);
  const canSee = (key: string) =>
    viewer.isAdmin || Object.prototype.hasOwnProperty.call(visible, key);

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
      ['Shelf', canSee('shelf') ? item.shelf : ''],
      ['Condition', item.condition],
      ['Condition notes', canSee('conditionNotes') ? item.conditionNotes || '' : ''],
      ['Location', canSee('location') ? item.location : ''],
      // publicView drops `location`, `conditionNotes`, `notes` etc. for
      // non-admins, so canSee() returns false and these render blank. `shelf`
      // is a library concept with no meaning in the catalogue; hidden from the
      // public tier because it is not on PUBLIC_SPINE.
      ...typeFields(item.itemType)
        .filter((f) => canSee(f.key))
        .map(
          (f) => [f.label, String((item as Record<string, any>)[f.key] || '')] as [string, string],
        ),
      // Acquisition info is private — only ever rendered for admins.
      ...((viewer.isAdmin
        ? [
            ['Source (private)', item.source || ''],
            ['Price paid (private)', item.pricePaid || ''],
          ]
        : []) as [string, string][]),
    ] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <article className="max-w-3xl">
      <Link href="/browse" className="text-sm text-rust hover:underline">
        ← back to catalog
      </Link>
      <ItemNav itemId={item.id} />
      <p className="mt-4 font-mono text-xs text-muted">#{String(item.id).padStart(6, '0')}</p>
      {viewer.isAdmin ? (
        <TitleEditor itemId={item.id} title={item.title} author={item.author} />
      ) : (
        <>
          <h1 className="mt-1 font-serif text-2xl leading-tight sm:text-3xl">{item.title}</h1>
          {item.author && <p className="mt-1 text-lg text-muted">{item.author}</p>}
        </>
      )}
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
            src={imageUrl(coverImage(item)!, 'web')}
            alt={item.title}
            className="mt-6 max-h-[28rem] w-auto max-w-full rounded shadow-sm"
          />
        )
      )}

      {viewer.isAdmin && <AddItemPhotos itemId={item.id} />}

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
          <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {viewer.isAdmin && item.genres.length > 0 && <Tags label="Genres" values={item.genres} accent />}
      {viewer.isAdmin && item.subjects.length > 0 && <Tags label="Subjects" values={item.subjects} />}

      {viewer.isAdmin && (
        <EditMode>
          <DetailsEditor
            itemId={item.id}
            values={{
              condition: item.condition || '',
              conditionNotes: item.conditionNotes || '',
              location: item.location || '',
              notes: item.notes || '',
              source: item.source || '',
              pricePaid: item.pricePaid || '',
            }}
          />
          <TypeFieldsEditor
            itemId={item.id}
            itemType={item.itemType}
            values={Object.fromEntries(
              typeFields(item.itemType).map((f) => [f.key, String((item as Record<string, any>)[f.key] || '')]),
            )}
          />
          <MetaEditor
            itemId={item.id}
            shelf={item.shelf}
            genres={item.genres}
            subjects={item.subjects}
            allShelves={allShelves}
            allGenres={allGenres}
          />
        </EditMode>
      )}
      {item.places.length > 0 && <Tags label="Places" values={item.places} />}

      {item.inscription && (
        <blockquote className="mt-6 border-l-2 border-rust/40 pl-4 font-serif italic text-ink/90">
          {item.inscription}
        </blockquote>
      )}
      {item.notes && canSee('notes') && <p className="mt-6 text-sm text-muted">{item.notes}</p>}

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
