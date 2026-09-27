import Link from 'next/link';
import { getViewer } from '@/lib/auth';
import { instance } from '@/lib/instance';
import { isStudioMember } from '@/lib/studioAccess';

// Studio instances have two sections: Sessions (the music projects, members
// only) and Gear (the catalogue). Library-style instances render nothing here.
export default async function StudioLink() {
  if (!instance.studio) return null;
  const { email } = await getViewer();
  return (
    <>
      {isStudioMember(email) && (
        <Link href="/studio" className="text-muted hover:text-rust">
          Sessions
        </Link>
      )}
      <Link href="/gear" className="text-muted hover:text-rust">
        Gear
      </Link>
    </>
  );
}
