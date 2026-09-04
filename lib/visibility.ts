import type { Item } from './types';

/**
 * Item visibility — three tiers, ordered from most open to least.
 *
 * STORED VALUE vs LABEL. The strings in VISIBILITY are what sit in the
 * `visibility` column; the labels are what the screen says. They deliberately
 * differ, and the reason is a trap worth naming: the label "Restricted" belongs
 * to the middle tier, while the word `restricted` is what the database has been
 * storing since the two-tier scheme to mean ADMIN ONLY. Storing the label would
 * quietly invert every existing row — books marked private becoming visible to
 * any signed-in viewer, with no diff to notice. So the stored values say who
 * reaches a record and nothing else:
 *
 *   public      anyone through the site gate          → labelled "Public"
 *   signed_in   a signed-in viewer (magic-link        → labelled "Restricted"
 *               session passing AUTH_ALLOWLIST)
 *   admin       admins only (AUTH_ADMINS)             → labelled "Private"
 *
 * The middle tier is a property of the SESSION, not of a URL. There is no share
 * token, no per-item link, nothing to send someone without an account — a
 * viewer reaches this tier by signing in, and the magic link is only how the
 * session was obtained, the same way the shared password is how a gate-holder
 * got through the door.
 *
 * The site gate (PUBLIC_GATE_PASSWORD) is not a tier. It is a door on the whole
 * deployment: it decides whether a stranger gets in at all, not which records
 * they see once they are in.
 */
export const VISIBILITY = ['public', 'signed_in', 'admin'] as const;
export type Visibility = (typeof VISIBILITY)[number];

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: 'Public',
  signed_in: 'Restricted',
  admin: 'Private',
};

/** One line of who-reaches-it, for tooltips and help text. */
export const VISIBILITY_HINT: Record<Visibility, string> = {
  public: 'Anyone through the site gate',
  signed_in: 'Signed-in viewers',
  admin: 'Admins only',
};

/** Glyph shown at rest in the list column and on cards. */
export const VISIBILITY_MARK: Record<Visibility, string> = {
  public: '✓',
  signed_in: '◐',
  admin: '🔒',
};

/** An item at rank N is visible to a viewer at rank N or above. */
const RANK: Record<Visibility, number> = { public: 0, signed_in: 1, admin: 2 };

/**
 * Values written by earlier versions, mapped to their current equivalent.
 *
 * `restricted` is every closed record in the database today: it meant admin
 * only under the two-tier scheme and still does. `link` is the short-lived name
 * the middle tier shipped under before it was called what it is.
 *
 * This map is what makes the rename safe to deploy BEFORE migrating: old rows
 * keep exactly the meaning they have now, so there is no window in which a
 * record is more visible than it was. Once
 *
 *   UPDATE items SET visibility = 'admin' WHERE visibility = 'restricted';
 *   UPDATE items SET visibility = 'signed_in' WHERE visibility = 'link';
 *
 * has run and no row holds either value, delete this map and the branch in
 * normalizeVisibility.
 */
const LEGACY: Record<string, Visibility> = {
  restricted: 'admin',
  link: 'signed_in',
};

export function isVisibility(v: unknown): v is Visibility {
  return typeof v === 'string' && (VISIBILITY as readonly string[]).includes(v);
}

/**
 * Public is the default. An absent, null or unrecognised value reads as public
 * rather than failing closed — the opposite of lib/fieldVisibility.ts, and on
 * purpose. That module governs whether prices and provenance cross the wire,
 * where the safe answer to "I don't know" is no. This one governs whether a
 * record exists to a viewer at all; a catalogue that quietly hides itself is a
 * worse failure than one that shows a book it needn't have.
 *
 * Legacy values are translated before that default applies, which is the whole
 * point of the map: without it, every stored `restricted` would fall through to
 * public and publish the closed records in one deploy.
 *
 * Writes are validated against the value list rather than normalized (see the
 * meta and bulk-visibility routes), so an unknown string is rejected at the
 * boundary and the default only ever fires on data that never had a value.
 */
export function normalizeVisibility(v: unknown): Visibility {
  if (isVisibility(v)) return v;
  if (typeof v === 'string' && LEGACY[v]) return LEGACY[v];
  return 'public';
}

type Viewer = { isAuthed?: boolean; isAdmin?: boolean };

export function viewerRank(viewer: Viewer): number {
  if (viewer.isAdmin) return RANK.admin;
  if (viewer.isAuthed) return RANK.signed_in;
  return RANK.public;
}

/** Does this viewer reach this record at all? */
export function canView(
  item: Pick<Item, 'visibility'> | { visibility?: string },
  viewer: Viewer,
): boolean {
  return RANK[normalizeVisibility(item.visibility)] <= viewerRank(viewer);
}
