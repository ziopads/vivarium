// Who may use the studio, and which paths belong to it.
//
// Pure functions over env vars and strings, with no imports, so the Edge
// middleware and the Node route handlers share one definition. The middleware
// is the door; every studio route and page checks again with the same rule.

function emailList(v: string | undefined): string[] {
  return (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * The email must be NAMED in AUTH_ALLOWLIST or AUTH_ADMINS.
 *
 * Deliberately stricter than lib/auth.ts isAllowed(), where an empty allowlist
 * admits anyone with a valid login. That default is tolerable for a catalogue
 * whose writes are admin-only; the studio lets every member create projects and
 * upload audio, so an unfilled list has to mean nobody.
 */
export function isStudioMember(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return emailList(process.env.AUTH_ALLOWLIST).includes(e) || emailList(process.env.AUTH_ADMINS).includes(e);
}

export function isStudioPath(path: string): boolean {
  return (
    path === '/studio' || path.startsWith('/studio/') ||
    path === '/api/studio' || path.startsWith('/api/studio/')
  );
}
