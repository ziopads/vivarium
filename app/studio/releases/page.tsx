import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { instance } from '@/lib/instance';
import { getStudioViewer, listArtists, listReleases } from '@/lib/studio';
import ReleaseList from '../_ui/ReleaseList';

export const metadata = { title: 'Releases' };
export const dynamic = 'force-dynamic';

export default async function ReleasesPage() {
  if (!instance.studio) notFound();
  const viewer = await getStudioViewer();
  if (!viewer) redirect('/login?next=/studio/releases');
  const [releases, artists] = await Promise.all([listReleases(), listArtists()]);
  return (
    <div>
      <Link href="/studio" className="text-sm text-muted hover:text-rust">
        ← Sessions
      </Link>
      <h1 className="mb-6 mt-2 font-serif text-2xl sm:text-3xl">Releases</h1>
      <ReleaseList initialReleases={releases} artists={artists} />
    </div>
  );
}
