import { promises as fs } from 'node:fs';
import path from 'node:path';
// First-run fallback only. The real data/wishlist.json is gitignored, and in
// production the wishlist lives in the Supabase `wishlist` table.
import bundled from '@/data/wishlist.example.json';
import { getSupabase } from './supabase';
import type { Item } from './types';

export type Wish = {
  id: number;
  title: string;
  author: string;
  section: string;
  note?: string;
  image?: string; // R2 key, e.g. "wishlist/42.webp"
  /**
   * Every photograph on a wishlist-native upload, as R2 keys under
   * wishlist/<id>/. A book worth documenting is worth documenting properly:
   * the copyright page is often the only thing that identifies an edition.
   *
   * `image` stays the cover, so list views and every wish added before this
   * field existed keep working untouched. Read through wishPhotos() rather
   * than either field directly.
   */
  images?: string[];
  addedBy: string; // email of the person who added it
  createdAt: string;

  // ---- carried over when a catalogue record is moved here ----------------
  // A book lost or given away keeps its write-up: the research is about the
  // title, not the copy, and someone browsing the wishlist for a gift needs to
  // see why it is wanted. These are all optional, so wishes added from a phone
  // photo are unaffected.
  description?: string;
  discussion?: string;
  publisher?: string;
  year?: string;
  isbn?: string;
  /** The gallery from the record it came from. R2 objects outlive the record. */
  gallery?: Item['images'];
  /** Id of the catalogue record this was made from, for the trail. */
  fromItem?: number;
};

const FILE = path.join(process.cwd(), 'data', 'wishlist.json');

// Local seed entries predate id/addedBy — normalize so dev never crashes.
function normalizeLocal(raw: any[]): Wish[] {
  return raw.map((w, i) => ({
    id: typeof w.id === 'number' ? w.id : i + 1,
    title: w.title || '',
    author: w.author || '',
    section: w.section || '',
    note: w.note || undefined,
    image: w.image || undefined,
    images: Array.isArray(w.images) && w.images.length ? w.images : undefined,
    addedBy: w.addedBy || '',
    createdAt: w.createdAt || '',
    description: w.description || undefined,
    discussion: w.discussion || undefined,
    publisher: w.publisher || undefined,
    year: w.year || undefined,
    isbn: w.isbn || undefined,
    gallery: Array.isArray(w.gallery) ? w.gallery : undefined,
    fromItem: typeof w.fromItem === 'number' ? w.fromItem : undefined,
  }));
}

export async function getWishlist(): Promise<Wish[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('wishlist').select('data').order('id');
    if (error) {
      // e.g. table not created yet — show an empty wishlist rather than 500ing.
      console.error('getWishlist:', error.message);
      return [];
    }
    return (data || []).map((r: { data: Wish }) => r.data);
  }
  try {
    return normalizeLocal(JSON.parse(await fs.readFile(FILE, 'utf8')));
  } catch {
    return normalizeLocal(bundled as unknown as any[]);
  }
}

async function writeLocal(items: Wish[]) {
  await fs.writeFile(FILE, JSON.stringify(items, null, 1), 'utf8');
}

export async function nextWishId(): Promise<number> {
  const all = await getWishlist();
  return all.reduce((m, w) => Math.max(m, w.id), 0) + 1;
}

/**
 * Every photograph on a wish, as R2 keys, in display order.
 *
 * One branch, in one place. Wishes added before `images` existed carry a single
 * `image`; the reader handles both rather than migrating the table, because a
 * migration that rewrites R2 keys can only go wrong and this cannot.
 */
export function wishPhotos(w: Wish): string[] {
  if (w.images && w.images.length) return w.images;
  return w.image ? [w.image] : [];
}

export async function addWish(w: Wish): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from('wishlist').upsert({ id: w.id, data: w }, { onConflict: 'id' });
    if (error) throw new Error(`Supabase addWish: ${error.message}`);
    return;
  }
  const all = await getWishlist();
  await writeLocal([...all.filter((x) => x.id !== w.id), w]);
}

export async function deleteWish(id: number): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from('wishlist').delete().eq('id', id);
    if (error) throw new Error(`Supabase deleteWish: ${error.message}`);
    return;
  }
  const all = await getWishlist();
  await writeLocal(all.filter((x) => x.id !== id));
}

// ---------------------------------------------------------------------------
// Moving between the catalogue and the wishlist
//
// A book can leave the library (lost, given away, sold) and come back as a
// gift, and neither direction should mean retyping a record. The write-up
// travels with it in both directions.
// ---------------------------------------------------------------------------

export function wishFromItem(item: Item, id: number, addedBy: string): Wish {
  const cover = item.images?.find((im) => im.src === item.cover) || item.images?.[0];
  return {
    id,
    title: item.title || '',
    author: item.author || '',
    section: item.section || '',
    note: item.notes || undefined,
    // The photographs stay in R2 when the record goes, so the gallery is still
    // renderable. `image` is left alone: it means a wishlist-native upload at
    // wishlist/<id>.webp, and pointing it at an items/ key would confuse r2Url.
    gallery: cover ? [cover, ...(item.images || []).filter((im) => im !== cover)] : undefined,
    addedBy,
    createdAt: new Date().toISOString(),
    description: item.description || undefined,
    discussion: item.discussion || undefined,
    publisher: item.publisher || undefined,
    year: item.year || undefined,
    isbn: item.isbn || undefined,
    fromItem: item.id,
  };
}

/**
 * The return trip. Everything the wish carries goes back onto a catalogue
 * record; anything it never had stays blank for the normal editing path.
 *
 * The new record gets a NEW id rather than reclaiming `fromItem` — that id may
 * have been reused, and reclaiming it would collide. `fromItem` stays in notes
 * as the trail.
 */
export function itemFromWish(w: Wish, id: number): Item {
  // Two sources, and they resolve differently. `gallery` holds ItemImages from
  // a catalogue record, already under the default 'items' prefix. A native
  // upload holds bare R2 keys under wishlist/<id>/, so those become ItemImages
  // with an explicit base — imageUrl() rebuilds `<base>/<src>.webp`, which is
  // why the prefix and the .webp suffix both come off here.
  const native = wishPhotos(w).map((key) => ({
    src: key.replace(/^wishlist\//, '').replace(/\.webp$/, ''),
    base: 'wishlist',
  }));
  const gallery = w.gallery && w.gallery.length ? w.gallery : native;
  const fromCatalogue = Boolean(w.gallery && w.gallery.length);

  return {
    id,
    itemType: 'Book',
    title: w.title || 'Untitled',
    author: w.author || '',
    publisher: w.publisher || '',
    placeOfPublication: '',
    year: w.year || '',
    edition: '',
    printing: '',
    isbn: w.isbn || '',
    format: '',
    description: w.description || '',
    blurb: '',
    discussion: w.discussion || undefined,
    signed: false,
    inscription: '',
    genres: [],
    shelf: '',
    images: gallery,
    subjects: [],
    places: [],
    condition: '',
    location: '',
    owner: '',
    notes: w.note || '',
    // The flat `image` string is resolved against 'items' by imgUrl, so it can
    // only carry a catalogue src. For wishlist-hosted photographs it stays null
    // and coverImage() falls through to images[0], which knows its own base.
    image: fromCatalogue ? gallery[0]?.src ?? null : null,
    section: w.section || '',
    visibility: 'public',
  };
}
