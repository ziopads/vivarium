import type { Item } from './types';
import bundled from '@/data/items.json';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.join(process.cwd(), 'data', 'items.json');
const ITEMS_DIR = path.join(process.cwd(), 'public', 'items');

async function readLocalItems(): Promise<Item[]> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8')) as Item[];
  } catch {
    return bundled as unknown as Item[];
  }
}

export async function writeLocalItems(items: Item[]): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 1), 'utf8');
}

function humanize(stem: string): string {
  return stem
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Build a book's gallery by scanning public/items/<id6>/ so that moving image
// files between item folders (in Finder) re-associates them on refresh.
// The item's `cover` (if present and found) is placed first.
async function scanImages(
  id: number,
  cover: string | undefined,
): Promise<{ src: string; label: string }[]> {
  const id6 = String(id).padStart(6, '0');
  let files: string[];
  try {
    files = await fs.readdir(path.join(ITEMS_DIR, id6));
  } catch {
    return [];
  }
  const stems = files
    .filter((f) => f.endsWith('.webp') && !f.endsWith('-thumb.webp'))
    .map((f) => f.slice(0, -'.webp'.length))
    .sort();
  const imgs = stems.map((s) => ({ src: `${id6}/${s}`, label: humanize(s) }));
  const ci = imgs.findIndex((im) => im.src === cover);
  if (ci > 0) imgs.unshift(imgs.splice(ci, 1)[0]);
  return imgs;
}

async function withScannedImages(items: Item[]): Promise<Item[]> {
  return Promise.all(
    items.map(async (it) => {
      const scanned = await scanImages(it.id, it.cover);
      if (scanned.length === 0) return it;
      return { ...it, images: scanned, image: scanned[0].src };
    }),
  );
}

const SELECT = `
  select id, item_type as "itemType", title, author, publisher,
         place_of_publication as "placeOfPublication", year, edition, printing, isbn,
         format, signed, inscription, genres, shelf, subjects, places, condition,
         location, owner, notes, description, blurb, discussion, image, images, cover
  from items`;

export async function getItems(): Promise<Item[]> {
  const url = process.env.DATABASE_URL;
  if (!url) return withScannedImages(await readLocalItems());
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  const rows = await sql.query(`${SELECT} order by title`);
  return rows as unknown as Item[];
}

export async function getItem(id: number): Promise<Item | null> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const it = (await readLocalItems()).find((i) => i.id === id);
    if (!it) return null;
    const scanned = await scanImages(it.id, it.cover);
    return scanned.length ? { ...it, images: scanned, image: scanned[0].src } : it;
  }
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  const rows = await sql.query(`${SELECT} where id = $1`, [id]);
  return (rows[0] as unknown as Item) ?? null;
}
