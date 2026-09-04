import type { Item } from './types';

/**
 * Item visibility — three tiers, ordered from most open to least.
 *
 * The strings here are the values stored in the `visibility` column. Two of them
 * are carried over verbatim from the two-tier scheme, so no row needs migrating:
 * everything currently stored is either 'public' or 'restricted', and both keep
 * exactly the meaning they had.
 *
 *   public      anyone who is through the site gate
 *   link        a signed-in viewer (magic link, subject to AUTH_ALLOWLIST)
 *   restricted  admins only (AUTH_ADMINS)
 *
 * The site gate (PUBLIC_GATE_PASSWORD) is NOT one of these tiers. It is a door
 * on the whole deployment — it decides whether a stranger gets in at all, not
 * which records they see once they are in. A gated instance with public items
 * shows those items to everyone holding the shared password.
 */
export const VISIBILITY = ['public', 'link', 'restricted'] as const;
export type Visibility = (typeof VISIBILITY)[number];

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: 'Public',
  link: 'Link',
  restricted: 'Private',
};

/** Glyph shown at rest in the list column and on cards. */
export const VISIBILITY_MARK: Record<Visibility, string> = {
  public: '✓',
  link: '↗',
  restricted: '🔒',
};

/** An item at rank N is visible to a viewer at rank N or above. */
const RANK: Record<Visibility, number> = { public: 0, link: 1, restricted: 2 };

export function isVisibility(v: unknown): v is Visibility {
  return typeof v === 'string' && (VISIBILITY as readonly string[]).includes(v);
}

/**
 * Public is the default. An absent, null or unrecognised value reads as public
 * rather than failing closed — the opposite of lib/fieldVisibility.ts, and on
 * purpose. That module governs whether prices and provenance cross the wire,
 * where the safe answer to "I don't know" is no. This one governs whether a
 * record exists to a viewer at all; every stored row today is already public or
 * restricted, and a catalogue that quietly hides itself is a worse failure than
 * one that shows a book it needn't have.
 *
 * Writes are validated against the value list rather than normalized (see the
 * meta and bulk-visibility routes), so an unknown string is rejected at the
 * boundary and this only ever fires on data that never had a value.
 */
export function normalizeVisibility(v: unknown): Visibility {
  return isVisibility(v) ? v : 'public';
}

type Viewer = { isAuthed?: boolean; isAdmin?: boolean };

export function viewerRank(viewer: Viewer): number {
  if (viewer.isAdmin) return RANK.restricted;
  if (viewer.isAuthed) return RANK.link;
  return RANK.public;
}

/** Does this viewer reach this record at all? */
export function canView(
  item: Pick<Item, 'visibility'> | { visibility?: string },
  viewer: Viewer,
): boolean {
  return RANK[normalizeVisibility(item.visibility)] <= viewerRank(viewer);
}
