import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { getWishlist } from '@/lib/wishlist';
import { getVocab } from '@/lib/vocab';
import { r2Url } from '@/lib/img';
import WishEditor from '@/app/ui/WishEditor';

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

  return (
    <article className="max-w-2xl">
      <Link href="/wishlist" className="text-sm text-rust hover:underline">← wishlist</Link>

      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        {w.image && (
          <a href={r2Url(w.image)} target="_blank" rel="noreferrer" className="shrink-0" title="Open full size">
            <img
              src={r2Url(w.image)}
              alt={w.title || 'wishlist photo'}
              className="max-h-[28rem] w-auto max-w-full rounded border border-line shadow-sm"
            />
          </a>
        )}
        <div className="min-w-0">
          <h1 className="font-serif text-2xl leading-tight sm:text-3xl">{w.title || '(untitled)'}</h1>
          {w.author && <p className="mt-1 text-lg text-muted">{w.author}</p>}
          {w.section && <p className="mt-2 text-sm text-rust">{w.section}</p>}
          {w.note && <p className="mt-3 max-w-prose text-sm text-ink/80">{w.note}</p>}
          <p className="mt-3 text-xs text-muted">
            added by {who}
            {when ? ` · ${when}` : ''}
          </p>
        </div>
      </div>

      {viewer.isAdmin && <WishEditor w={w} sections={vocab.sections} />}
    </article>
  );
}
