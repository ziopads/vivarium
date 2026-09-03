import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { getWishlist, wishPhotos } from '@/lib/wishlist';
import { getVocab } from '@/lib/vocab';
import { r2Url, imageUrl } from '@/lib/img';
import Discussion from '@/app/ui/Discussion';
import WishEditor from '@/app/ui/WishEditor';
import WishToItem from '@/app/ui/WishToItem';

export const dynamic = 'force-dynamic';

export default async function WishDetail({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer.isAuthed) redirect(`/login?next=/wishlist/${params.id}`);

  const wishes = await getWishlist();
  const w = wishes.find((x) => x.id === Number(params.id));
  if (!w) notFound();

  const vocab = await getVocab();
  const who = w.addedBy ? w.addedBy.split('@')[0] : '—';
  const when = w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '';
  // Two sources of photographs. A wish added from a phone carries its own R2
  // keys; one made from a catalogue record carries that record's gallery. Show
  // whichever it has, all of them.
  const photos = wishPhotos(w);
  const carried = w.gallery && w.gallery.length ? w.gallery : [];

  return (
    <article className="max-w-2xl">
      <Link href="/wishlist" className="text-sm text-rust hover:underline">← wishlist</Link>

      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        {(photos.length > 0 || carried.length > 0) && (
          <div className="flex shrink-0 flex-col gap-3">
            {photos.map((key, i) => (
              <a
                key={key}
                href={r2Url(key)}
                target="_blank"
                rel="noreferrer"
                title="Open full size"
              >
                <img
                  src={r2Url(key)}
                  alt={
                    i === 0
                      ? w.title || 'wishlist photo'
                      : `${w.title || 'wishlist photo'} — photo ${i + 1}`
                  }
                  className="max-h-[28rem] w-auto max-w-full rounded border border-line shadow-sm"
                />
              </a>
            ))}
            {photos.length === 0 &&
              carried.map((im) => (
                <img
                  key={im.src}
                  src={imageUrl(im, 'web')}
                  alt={w.title || 'wishlist photo'}
                  className="max-h-[28rem] w-auto max-w-full rounded border border-line shadow-sm"
                />
              ))}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-serif text-2xl leading-tight sm:text-3xl">{w.title || '(untitled)'}</h1>
          {w.author && <p className="mt-1 text-lg text-muted">{w.author}</p>}
          {w.section && <p className="mt-2 text-sm text-rust">{w.section}</p>}
          {(w.publisher || w.year || w.isbn) && (
            <p className="mt-1 text-xs text-muted">
              {[w.publisher, w.year, w.isbn].filter(Boolean).join(' · ')}
            </p>
          )}
          {w.note && <p className="mt-3 max-w-prose text-sm text-ink/80">{w.note}</p>}
          <p className="mt-3 text-xs text-muted">
            added by {who}
            {when ? ` · ${when}` : ''}
          </p>
        </div>
      </div>

      {/* The write-up, when this came from a catalogue record. It is the reason
          someone browsing for a gift can tell whether a book is the right one. */}
      {w.description && (
        <p className="mt-6 max-w-prose font-serif leading-relaxed text-ink/90">{w.description}</p>
      )}
      {w.discussion && (
        <details className="group mt-4 max-w-prose">
          <summary className="cursor-pointer list-none text-sm text-rust marker:content-none hover:underline">
            <span className="group-open:hidden">more…</span>
            <span className="hidden group-open:inline">less ▴</span>
          </summary>
          <div className="mt-3 border-l-2 border-line pl-4 text-sm text-ink/80">
            <Discussion md={w.discussion} />
          </div>
        </details>
      )}

      {viewer.isAdmin && <WishToItem wishId={w.id} />}
      {viewer.isAdmin && <WishEditor w={w} sections={vocab.sections} />}
    </article>
  );
}
