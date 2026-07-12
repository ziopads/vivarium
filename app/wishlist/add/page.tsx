import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import AddWishForm from '@/app/ui/AddWishForm';

export const dynamic = 'force-dynamic';

export default async function AddWishPage() {
  const viewer = await getViewer();
  if (!viewer.isAuthed) redirect('/login?next=/wishlist/add');
  return <AddWishForm />;
}
