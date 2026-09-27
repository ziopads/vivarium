import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getViewer } from '@/lib/auth';
import { getItem } from '@/lib/data';
import { GATE_COOKIE, gateEnabled, isGateCookieValid } from '@/lib/gate';
import { r2Configured, signImageGet } from '@/lib/storage';
import { canView } from '@/lib/visibility';

export const dynamic = 'force-dynamic';

// GET /api/img/<key>   e.g. /api/img/items/000123/01-photo.webp
//
// Images for instances whose bucket is PRIVATE (NEXT_PUBLIC_PRIVATE_IMAGES=1,
// see lib/img.ts). A public bucket's keys are predictable — items/<id>/01-… —
// so anyone could walk them, past the site gate and past record visibility.
// Here the viewer is checked against the record the image belongs to, then
// redirected to a signed R2 link.
//
// Middleware's matcher skips paths ending in .webp/.jpg/.png, so this route is
// not behind the gate by default. It checks the gate itself.

const SIGNED_TTL = 60 * 60; // the signed link lives an hour…
const BROWSER_CACHE = 50 * 60; // …and the browser reuses the redirect for 50 minutes, inside that.

const ALLOWED = /^(items|wishlist)\/[A-Za-z0-9._\/-]+\.(webp|jpe?g|png)$/;

export async function GET(_req: Request, { params }: { params: { key: string[] } }) {
  const key = params.key.map(decodeURIComponent).join('/');
  if (!ALLOWED.test(key) || key.includes('..')) return new NextResponse('Not found', { status: 404 });
  if (process.env.NEXT_PUBLIC_PRIVATE_IMAGES !== '1' || !r2Configured()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const viewer = await getViewer();
  if (gateEnabled() && !viewer.isAuthed && !viewer.isAdmin) {
    const ok = await isGateCookieValid(cookies().get(GATE_COOKIE)?.value);
    if (!ok) return new NextResponse('Not found', { status: 404 });
  }

  if (key.startsWith('items/')) {
    // items/<id6>/… — the image is visible exactly when its record is.
    const id = Number(key.split('/')[1]);
    const item = Number.isInteger(id) ? await getItem(id) : null;
    if (!item || !canView(item, viewer)) return new NextResponse('Not found', { status: 404 });
  } else if (!viewer.isAuthed && !viewer.isAdmin) {
    // wishlist/… — the wishlist is for signed-in viewers only.
    return new NextResponse('Not found', { status: 404 });
  }

  const res = NextResponse.redirect(await signImageGet(key, SIGNED_TTL), 302);
  res.headers.set('Cache-Control', `private, max-age=${BROWSER_CACHE}`);
  return res;
}
