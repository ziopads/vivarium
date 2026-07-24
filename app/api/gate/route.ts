import { NextResponse } from 'next/server';
import { passwordMatches, makeGateCookie, GATE_COOKIE, gateEnabled } from '@/lib/gate';

export const dynamic = 'force-dynamic';

// POST /api/gate  { password, next? }
// Sets the shared-password cookie on a correct answer. No-op if the gate is off.
export async function POST(req: Request) {
  if (!gateEnabled()) {
    return NextResponse.json({ ok: true, redirect: '/' });
  }

  let password = '';
  let next = '/';
  try {
    const body = await req.json();
    password = String(body?.password ?? '');
    if (typeof body?.next === 'string' && body.next.startsWith('/')) next = body.next;
  } catch {
    /* empty / malformed body → treated as wrong password below */
  }

  if (!passwordMatches(password)) {
    // Deliberately vague, and a small delay to blunt rapid guessing. Rope, not
    // vault — this is friction, not a real rate limiter.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ ok: false, error: 'Incorrect password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, redirect: next });
  res.cookies.set(GATE_COOKIE, await makeGateCookie(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
