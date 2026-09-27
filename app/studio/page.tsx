import { notFound, redirect } from 'next/navigation';
import { instance } from '@/lib/instance';
import { getMemberArtistId, getStudioViewer, listArtists, listGenres, listProjects, listReleases } from '@/lib/studio';
import StudioProjects from './_ui/StudioProjects';

export const metadata = { title: 'Sessions' };
export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  // Middleware already answers these; repeated so the page is safe on its own.
  if (!instance.studio) notFound();
  const viewer = await getStudioViewer();
  if (!viewer) redirect('/login?next=/studio');

  const [projects, artists, genres, releases, memberArtistId] = await Promise.all([
    listProjects(),
    listArtists(),
    listGenres(),
    listReleases(),
    getMemberArtistId(viewer.email),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">Sessions</h1>
        <p className="text-sm text-muted">
          {projects.length} {projects.length === 1 ? 'session' : 'sessions'}
        </p>
      </div>
      <StudioProjects
        initialProjects={projects}
        artists={artists}
        initialGenres={genres}
        initialReleases={releases}
        defaultArtistId={memberArtistId}
      />
    </div>
  );
}
