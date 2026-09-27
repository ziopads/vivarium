import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { instance } from '@/lib/instance';
import { getProject, getStudioViewer, listArtists, listGenres, listNames, listTracks } from '@/lib/studio';
import { audioConfigured } from '@/lib/studioAudio';
import ProjectDetail from '../_ui/ProjectDetail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const project = Number.isInteger(id) && id > 0 ? await getProject(id).catch(() => null) : null;
  if (!project) return { title: 'Studio' };
  return { title: `${project.artist.code} ${project.canonicalId}${project.workingName ? ` — ${project.workingName}` : ''}` };
}

export default async function StudioProjectPage({ params }: { params: { id: string } }) {
  if (!instance.studio) notFound();
  const viewer = await getStudioViewer();
  if (!viewer) redirect(`/login?next=/studio/${encodeURIComponent(params.id)}`);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const project = await getProject(id);
  if (!project) notFound();

  const [tracks, names, artists, genres, { isAdmin }] = await Promise.all([
    listTracks(id),
    listNames(id),
    listArtists(),
    listGenres(),
    getViewer(),
  ]);

  return (
    <div>
      <Link href="/studio" className="text-sm text-muted hover:text-rust">
        ← Studio
      </Link>
      <ProjectDetail
        initialProject={project}
        initialTracks={tracks}
        names={names}
        artists={artists}
        initialGenres={genres}
        canDelete={isAdmin}
        uploadsEnabled={audioConfigured()}
      />
    </div>
  );
}
