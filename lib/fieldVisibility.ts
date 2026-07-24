// Server-side field visibility for the public view.
//
// TRUST MODEL
//   admin (magic-link email in AUTH_ADMINS) → full record, no stripping
//   shared-password gallerist                → publicView(item)
//   nobody                                    → bounced by the gate, never reaches here
//
// The point of this file is that "public" is enforced on the SERVER, before a
// record is serialized — not chosen by the client. Anyone can open the network
// tab; the wire must not carry prices to the public tier.
//
// FAIL-CLOSED. A field is private unless it is BOTH (a) eligible to be public
// and (b) currently switched on in the vocab allowlist. A field nobody has
// classified stays hidden. The deliberate act is exposure, never concealment —
// the right default for data that includes prices.

import type { Item } from './types';
import { ARTWORK_TYPES } from './itemTypes';

/**
 * Attribute keys that may be exposed by toggling them on in /admin/vocab.
 * Everything about the OBJECT, nothing about the DEAL. This is the ceiling on
 * what an admin can ever make public — the checkboxes offer only these.
 */
export const PUBLICABLE_FIELDS = [
  'refNumber',
  'medium',
  'dimensions',
  'framing',
  'exhibitions',
  'bibliography',
  'status',
] as const;

/**
 * Attribute keys that are ALWAYS private and are never offered as a toggle.
 * Hardcoded, so no admin misclick and no future vocab edit can expose them.
 * These are the commercial interior.
 */
export const NEVER_PUBLIC_FIELDS = [
  'price',
  'realizedPrice',
  'provenance',
  'invoice',
  'saleHistory',
  'index',
  'notes',
  'location',
  'owner',
  'conditionNotes',
] as const;

/**
 * Spine fields that survive into the public view unconditionally. Everything a
 * viewer needs to SEE the work — never anything about its handling or sale.
 * Anything not listed here and not an allowed attribute is dropped.
 */
const PUBLIC_SPINE = new Set<keyof Item | string>([
  'id',
  'itemType',
  'title',
  'author',
  'year',
  'section',
  'images',
  'image',
  'cover',
  'description',
  'genres',
  'subjects',
  'places',
  'signed',
  'maine',
  'visibility',
]);

const NEVER = new Set<string>(NEVER_PUBLIC_FIELDS);
const PUBLICABLE = new Set<string>(PUBLICABLE_FIELDS);

/**
 * Reduce an item to what the public tier is allowed to see, given the current
 * allowlist. `allow` comes from vocab.publicFields at request time, so a toggle
 * in admin is live without a deploy.
 *
 * The allowlist is intersected with PUBLICABLE — a stored allowlist can never
 * widen the ceiling, only pick from within it. So even a corrupted or
 * hand-edited vocab file cannot leak a NEVER_PUBLIC field.
 */
export function publicView(item: Item, allow: readonly string[]): Partial<Item> {
  const on = new Set([...allow].filter((k) => PUBLICABLE.has(k) && !NEVER.has(k)));
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(item)) {
    if (NEVER.has(k)) continue;
    if (PUBLIC_SPINE.has(k)) {
      out[k] = v;
      continue;
    }
    if (on.has(k)) out[k] = v;
    // Everything else — unclassified attributes — is dropped.
  }
  return out as Partial<Item>;
}

/** Only artwork instances carry commercial fields; a plain Book has none of
 *  this to hide, so stripping it is a no-op but harmless. Kept as a hook in
 *  case a future tier wants type-specific rules. */
export function isArtwork(itemType: string): boolean {
  return (ARTWORK_TYPES as readonly string[]).includes(itemType);
}

/** The default allowlist for a brand-new instance: object facts a gallerist
 *  expects to see, nothing commercial. Seeded into vocab by the ingest. */
export const DEFAULT_PUBLIC_FIELDS: string[] = [
  'refNumber',
  'medium',
  'dimensions',
  'exhibitions',
];
