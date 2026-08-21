import { promises as fs } from 'node:fs';
import path from 'node:path';
// First-run fallback only. The real data/wishlist.json is gitignored, and in
// production the wishlist lives in the Supabase `wishlist` table.
import bundled from '@/data/wishlist.example.json';
import { getSupabase } from './supabase';

export type Wish = {
  id: number;
  title: string;
  author: string;
  section: string;
  note?: string;
  image?: string; // R2 key, e.g. "wishlist/42.webp"
  addedBy: string; // email of the person who added it
  createdAt: string;
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
    addedBy: w.addedBy || '',
    createdAt: w.createdAt || '',
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
