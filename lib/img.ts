// Client-safe. Builds URLs for item images.
//
// Two resolution paths:
//   1. Records carrying a pipeline-resolved `files` block use those filenames
//      verbatim — four-tier jpg paintings, and eventually any book whose
//      originals justify a zoom tier.
//   2. Legacy records construct items/<src>{-thumb}.webp as before.
//
// Either way the result is a key under a base prefix, and that same key string
// is a local path in dev and an R2 object key in production — only the host
// changes. The key is stored in every images[].src value, so it is expensive to
// revise once data exists.

export type ImageTier = 'thumb' | 'web' | 'zoom' | 'full';

export type ItemImage = {
  src: string;
  label?: string;
  /** Pipeline-resolved paths relative to the base prefix. */
  files?: { thumb: string; web: string; zoom?: string | null; full?: string };
  /** Overrides the default 'items' prefix. Rarely needed. */
  base?: string;
};

const DEFAULT_BASE = 'items';

const strip = (s: string) => s.replace(/^\/+|\/+$/g, '');

/**
 * An explicitly named local image directory, or null.
 *
 * Mirrors LOCAL_DATA_FILE's semantics: naming a local tree is an unambiguous
 * statement that you intend to work against it, so it wins over R2. Without
 * this precedence, a dev instance holding the library's R2 credentials would
 * request the catalogue's images from the library's bucket — silently, since
 * those requests never touch the local server.
 */
function localDir(): string | null {
  const v = process.env.NEXT_PUBLIC_LOCAL_IMAGE_DIR;
  return v ? strip(v) : null;
}

/**
 * In production each instance has its own R2 bucket, so the key prefix stays
 * constant and stored paths are portable between instances. In dev a single
 * filesystem serves every instance, so the folder must be namespaced.
 */
function prefix(base?: string): string {
  return localDir() ?? strip(base || DEFAULT_BASE);
}

function withHost(key: string): string {
  if (localDir()) return `/${key}`;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  return base ? `${base}/${key}` : `/${key}`;
}

/** Legacy string form. Unchanged behaviour; still used by records without `files`. */
export function imgUrl(src: string, thumb = false): string {
  return withHost(`${prefix()}/${src}${thumb ? '-thumb' : ''}.webp`);
}

/**
 * Tier-aware form. The zoom fallback lives here and nowhere else — 19 of the
 * catalogue's 232 images have no zoom tier because their source was too small
 * to make one worth having, and for those _web IS the full image.
 */
export function imageUrl(img: ItemImage, tier: ImageTier = 'web'): string {
  const base = prefix(img.base);
  if (img.files) {
    const f = img.files;
    const file =
      tier === 'zoom' ? f.zoom ?? f.web : tier === 'full' ? f.full ?? f.web : f[tier];
    return withHost(`${base}/${file}`);
  }
  // Legacy two-tier webp: anything above web resolves to the single full size.
  return withHost(`${base}/${img.src}${tier === 'thumb' ? '-thumb' : ''}.webp`);
}

/** True only when a real zoom tier exists — use to decide whether to offer zoom UI. */
export function hasZoom(img: ItemImage): boolean {
  return Boolean(img.files?.zoom);
}

/**
 * The image a list view should show. Prefers the explicitly chosen cover, then
 * the first image. Call sites that currently pass the bare `item.image` string
 * should move to this, so tiered records resolve correctly.
 */
export function coverImage(item: {
  images?: ItemImage[];
  cover?: string;
  image?: string | null;
}): ItemImage | null {
  const imgs = item.images ?? [];
  if (item.cover) {
    const found = imgs.find((i) => i.src === item.cover);
    if (found) return found;
  }
  if (imgs.length) return imgs[0];
  // Last resort: a legacy record with only the flat `image` string.
  return item.image ? { src: item.image } : null;
}

// For an arbitrary R2 key (e.g. wishlist/42.webp).
export function r2Url(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  return base ? `${base}/${key}` : `/${key}`;
}
