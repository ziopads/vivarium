import Link from 'next/link';
import { getViewer } from '@/lib/auth';
import { instance } from '@/lib/instance';
import { isStudioMember } from '@/lib/studioAccess';

// The Studio nav link: only on instances with the studio switched on, and only
// for someone who would be let in.
export default async function StudioLink() {
  if (!instance.studio) return null;
  const { email } = await getViewer();
  if (!isStudioMember(email)) return null;
  return (
    <Link href="/studio" className="text-muted hover:text-rust">
      Studio
    </Link>
  );
}
