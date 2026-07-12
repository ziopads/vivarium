// Client-safe. Builds the URL for an item image — from Cloudflare R2 when
// NEXT_PUBLIC_R2_PUBLIC_URL is set, else the local /items path (dev without R2).
// The `src` stored on items (e.g. "000042/01-cover") is unchanged; only the
// host/prefix differs, so no data migration is needed.
export function imgUrl(src: string, thumb = false): string {
  const key = `items/${src}${thumb ? '-thumb' : ''}.webp`;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  return base ? `${base}/${key}` : `/${key}`;
}

// For an arbitrary R2 key (e.g. wishlist/42.webp).
export function r2Url(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  return base ? `${base}/${key}` : `/${key}`;
}
