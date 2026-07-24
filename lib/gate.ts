// Shared-password "velvet rope" for the public tier. Standalone: does NOT
// depend on Supabase, so it works in any deployment and is testable locally.
//
// This is a rope, not a vault. One shared password admits a visitor to the
// PUBLIC (field-stripped) view. Admin rights are separate and unchanged —
// still the magic-link email in AUTH_ADMINS, layered on top for edit access.
//
// Enabled per deployment by PUBLIC_GATE_ENABLED=1. Unset or "0" → no gate,
// exactly the current vivarium.gaffcutter.com behaviour.
//
// Runs in middleware (Edge runtime), so it uses Web Crypto (crypto.subtle),
// not node:crypto.

const COOKIE = 'vv_gate';

export function gateEnabled(): boolean {
  return process.env.PUBLIC_GATE_ENABLED === '1';
}

function gatePassword(): string {
  return process.env.PUBLIC_GATE_PASSWORD || '';
}

/**
 * Signing secret. Prefer an explicit PUBLIC_GATE_SECRET; fall back to the
 * password itself so the gate still works with only the two documented vars
 * set. Either way the cookie carries an HMAC, so a visitor cannot forge entry
 * by guessing the cookie format — they'd need the secret.
 */
function secret(): string {
  return process.env.PUBLIC_GATE_SECRET || gatePassword() || 'vivarium';
}

async function hmac(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The cookie value is a signature over a fixed token plus the current password.
 * Binding the password in means that CHANGING PUBLIC_GATE_PASSWORD invalidates
 * every existing cookie — rotating the password logs everyone out, which is the
 * behaviour you want from a shared rope.
 */
export async function makeGateCookie(): Promise<string> {
  return hmac(`granted:${gatePassword()}`);
}

export async function isGateCookieValid(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const expected = await makeGateCookie();
  // Length-then-content compare. Not perfectly constant-time across the Edge
  // runtime, but this is a rope: the threat is a curious visitor, not a timing
  // attacker, and there is no sensitive secret behind it beyond the stripped
  // public view.
  if (value.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Correct-password check for the verify route. */
export function passwordMatches(candidate: string): boolean {
  const pw = gatePassword();
  return pw.length > 0 && candidate === pw;
}

export const GATE_COOKIE = COOKIE;
