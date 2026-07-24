import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { gateEnabled, isGateCookieValid, GATE_COOKIE } from '@/lib/gate';

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.AUTH_ADMINS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

// Paths that must stay reachable WITHOUT the gate cookie, or a gated site can
// never show its own password prompt or accept the answer.
function isGateExempt(path: string): boolean {
  return (
    path === '/gate' ||
    path.startsWith('/api/gate') ||
    path === '/login' ||          // admins still need to reach the magic-link login
    path.startsWith('/api/auth') ||
    path.startsWith('/_next') ||
    path === '/favicon.ico'
  );
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const path = req.nextUrl.pathname;

  // ── velvet rope ──────────────────────────────────────────────────────────
  // Standalone and first, so it protects the site independently of whether
  // Supabase auth is configured. Off unless PUBLIC_GATE_ENABLED=1, so the
  // current ungated deployment is unaffected.
  if (gateEnabled() && !isGateExempt(path)) {
    const ok = await isGateCookieValid(req.cookies.get(GATE_COOKIE)?.value);
    if (!ok) {
      const dest = new URL('/gate', req.url);
      dest.searchParams.set('next', path + req.nextUrl.search);
      return NextResponse.redirect(dest);
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res; // auth not configured (local mode)

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  // Guard write APIs — every mutation is a non-GET request under these paths.
  if (
    req.method !== 'GET' &&
    (path.startsWith('/api/items') || path.startsWith('/api/vocab')) &&
    !isAdmin(user?.email)
  ) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Admin-only areas: the tagging + vocabulary tools.
  if ((path.startsWith('/admin') || path.startsWith('/manage')) && !isAdmin(user?.email)) {
    const dest = new URL('/login', req.url);
    dest.searchParams.set('next', path);
    return NextResponse.redirect(dest);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|png|jpg|jpeg|svg|ico|txt)).*)'],
};
