import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function parseList(v: string | undefined): string[] {
  return (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Empty allowlist = anyone with a valid login is allowed (useful before you've
// filled it in). Non-empty = only those emails.
export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = parseList(process.env.AUTH_ALLOWLIST);
  return list.length === 0 || list.includes(email.toLowerCase());
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseList(process.env.AUTH_ADMINS).includes(email.toLowerCase());
}

// Server-side auth client (anon key + cookie session). Safe in Server
// Components (cookie writes are swallowed there; middleware refreshes them).
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* read-only in a Server Component — refreshed by middleware */
        }
      },
    },
  });
}

export async function getViewer(): Promise<{ email: string | null; isAuthed: boolean; isAdmin: boolean }> {
  if (!URL || !ANON) return { email: null, isAuthed: false, isAdmin: false };
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  return { email, isAuthed: !!email && isAllowed(email), isAdmin: isAdmin(email) };
}
