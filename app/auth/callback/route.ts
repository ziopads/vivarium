import { NextResponse } from 'next/server';
import { createServerSupabase, isAllowed } from '@/lib/auth';
import { gateEnabled, makeGateCookie, GATE_COOKIE } from '@/lib/gate';

// Handles the magic-link redirect: exchanges the code for a session, enforces
// the allowlist, then sends the user on.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!isAllowed(data.user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=notallowed`);
      }

      // A SIGNED-IN VISITOR IS PAST THE ROPE.
      //
      // The gate and the session are independent: middleware checks the gate
      // cookie first and returns before it ever constructs a Supabase client, so
      // without this an admin who signs in still meets the shared-password
      // prompt on the very next page. Deliberately not fixed in middleware,
      // where reading the session before the gate would put a database round
      // trip in front of every request — the coupling that made a gated site
      // hang when its database stalled.
      //
      // Here it is free. The code has already been exchanged and the allowlist
      // already checked, so this admits someone who has proved more than the
      // shared password ever asks for.
      const res = NextResponse.redirect(`${origin}${next}`);
      if (gateEnabled()) {
        res.cookies.set(GATE_COOKIE, await makeGateCookie(), {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        });
      }
      return res;
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
