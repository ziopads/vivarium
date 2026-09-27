import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { instance } from '@/lib/instance';
import { getRelease, getStudioViewer, listArtists, listProjects, releaseProjects } from '@/lib/studio';
import ReleaseDetail from '../../_ui/ReleaseDetail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const release = Number.isInteger(id) && id > 0 ? await getRelease(id).catch(() => null) : null;
  return { title: release ? release.title : 'Release' };
}

export default async function ReleasePage({ params }: { params: { id: string } }) {
  if (!instance.studio) notFound();
  const viewer = await getStudioViewer();
  if (!viewer) redirect(`/login?next=/studio/releases/${encodeURIComponent(params.id)}`);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const release = await getRelease(id);
  if (!release) notFound();
  const [tracks, artists, all] = await Promise.all([releaseProjects(id), listArtists(), listProjects()]);
  return (
    <div>
      <Link href="/studio/releases" className="text-sm text-muted hover:text-rust">
        ← Releases
      </Link>
      <ReleaseDetail initialRelease={release} initialTracks={tracks} artists={artists} allSessions={all} />
    </div>
  );
}
