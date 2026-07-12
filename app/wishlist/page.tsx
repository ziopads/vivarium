import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { getWishlist } from '@/lib/wishlist';
import { getVocab } from '@/lib/vocab';
import WishlistView from '@/app/ui/WishlistView';

export const metadata = { title: 'Wishlist — Vivarium' };
export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  const viewer = await getViewer();
  if (!viewer.isAuthed) redirect('/login?next=/wishlist');

  const wishes = await getWishlist();
  const vocab = await getVocab();

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-serif text-2xl sm:text-3xl">Wishlist</h1>
        <Link href="/" className="text-sm text-rust hover:underline">← catalog</Link>
      </div>
      <WishlistView
        wishes={wishes}
        viewerEmail={viewer.email}
        isAdmin={viewer.isAdmin}
        sections={vocab.sections}
      />
    </div>
  );
}
