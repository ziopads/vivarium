// Folder scanning for item galleries.
//
// Formerly ran inside getItems()/getItem() in local mode, which meant the
// gallery you saw depended on the backend: Supabase returned stored images,
// local mode substituted whatever happened to be in the folder. Dev and
// production disagreed about what an item's images were, and the substitution
// could not be reproduced in the environment that mattered.
//
// Now the record is authoritative in both modes, and scanning is an explicit,
// reviewable write — see app/api/items/rescan.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ITEMS_DIR = path.join(
  process.cwd(),
  'public',
  // Must match lib/img.ts's dev prefix, or a rescan would look in one folder
  // while the browser requests another.
  (process.env.NEXT_PUBLIC_LOCAL_IMAGE_DIR || 'items').replace(/^\/+|\/+$/g, ''),
);

export type GalleryImage = { src: string; label: string };

export function humanize(stem: string): string {
  return stem
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Read the gallery implied by public/items/<id6>/.
 * Returns null when the directory is missing or unreadable — distinct from an
 * empty array, which means the directory exists and holds no images. Callers
 * must treat those differently: a missing directory is usually an unmounted
 * drive or an unbuilt tree, not an instruction to empty the gallery.
 */
export async function scanFolder(id: number): Promise<GalleryImage[] | null> {
  const id6 = String(id).padStart(6, '0');
  let files: string[];
  try {
    files = await fs.readdir(path.join(ITEMS_DIR, id6));
  } catch {
    return null;
  }
  const stems = files
    .filter((f) => f.endsWith('.webp') && !f.endsWith('-thumb.webp'))
    .map((f) => f.slice(0, -'.webp'.length))
    .sort();
  return stems.map((s) => ({ src: `${id6}/${s}`, label: humanize(s) }));
}

export type RescanDiff = {
  id: number;
  added: GalleryImage[];
  missing: GalleryImage[];
  /** Set when the folder could not be read at all. */
  error?: string;
};

/**
 * Merge a scanned folder into an existing gallery.
 *
 * Additive by default: new files are appended, files present on the record but
 * absent from disk are reported and kept. Existing order is preserved, because
 * an alphabetical re-sort would silently undo manual gallery ordering.
 *
 * Refuses to act when the folder is missing, or when it is empty and the record
 * has images — that is the broken-symlink and unbuilt-tree case, and treating it
 * as truth would blank every gallery at once.
 */
export function mergeGallery(
  current: GalleryImage[],
  scanned: GalleryImage[] | null,
  opts: { prune?: boolean } = {},
): { images: GalleryImage[]; added: GalleryImage[]; missing: GalleryImage[]; error?: string } {
  if (scanned === null) {
    return { images: current, added: [], missing: [], error: 'folder missing or unreadable' };
  }
  if (scanned.length === 0 && current.length > 0) {
    return { images: current, added: [], missing: [], error: 'folder empty but record has images' };
  }

  const onDisk = new Set(scanned.map((i) => i.src));
  const onRecord = new Set(current.map((i) => i.src));

  const missing = current.filter((i) => !onDisk.has(i.src));
  const added = scanned.filter((i) => !onRecord.has(i.src));

  const kept = opts.prune ? current.filter((i) => onDisk.has(i.src)) : current;

  return { images: [...kept, ...added], added, missing };
}
