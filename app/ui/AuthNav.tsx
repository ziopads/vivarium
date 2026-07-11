import Link from 'next/link';
import { getViewer } from '@/lib/auth';

export default async function AuthNav() {
  const { email, isAuthed, isAdmin } = await getViewer();

  if (!isAuthed) {
    return (
      <Link href="/login" className="text-muted hover:text-rust">
        Sign in
      </Link>
    );
  }

  return (
    <span className="flex items-baseline gap-3">
      {isAdmin && (
        <Link href="/admin" className="text-muted hover:text-rust">
          Admin
        </Link>
      )}
      <span className="hidden text-xs text-muted sm:inline">{email}</span>
      <form action="/auth/signout" method="post">
        <button className="text-muted hover:text-rust">Sign out</button>
      </form>
    </span>
  );
}
