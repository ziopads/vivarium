import Link from 'next/link';
import { getViewer } from '@/lib/auth';

// Only shows the Wishlist nav link to signed-in users.
export default async function WishlistLink() {
  const { isAuthed } = await getViewer();
  if (!isAuthed) return null;
  return (
    <Link href="/wishlist" className="text-muted hover:text-rust">
      Wishlist
    </Link>
  );
}
