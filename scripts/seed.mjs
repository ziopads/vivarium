import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL first (see .env.example).');
  process.exit(1);
}

const sql = neon(url);
const dir = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(join(dir, '..', 'data', 'items.json'), 'utf8'));
const schema = readFileSync(join(dir, '..', 'db', 'schema.sql'), 'utf8');

for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
  await sql.query(stmt);
}

for (const i of items) {
  await sql.query(
    `insert into items
      (id,item_type,title,author,publisher,place_of_publication,year,edition,printing,isbn,format,signed,inscription,genres,shelf,subjects,places,condition,location,owner,notes,description,blurb,discussion,image,images,cover)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     on conflict (id) do update set
       item_type=excluded.item_type, title=excluded.title, author=excluded.author,
       publisher=excluded.publisher, place_of_publication=excluded.place_of_publication,
       year=excluded.year, edition=excluded.edition, printing=excluded.printing, isbn=excluded.isbn,
       format=excluded.format, signed=excluded.signed, inscription=excluded.inscription, genres=excluded.genres,
       shelf=excluded.shelf, subjects=excluded.subjects,
       places=excluded.places, condition=excluded.condition, location=excluded.location,
       owner=excluded.owner, notes=excluded.notes, description=excluded.description,
       blurb=excluded.blurb, discussion=excluded.discussion,
       image=excluded.image, images=excluded.images, cover=excluded.cover`,
    [
      i.id, i.itemType, i.title, i.author, i.publisher, i.placeOfPublication, i.year,
      i.edition, i.printing ?? '', i.isbn ?? '', i.format, i.signed, i.inscription, i.genres,
      i.shelf, i.subjects, i.places, i.condition, i.location, i.owner, i.notes,
      i.description ?? '', i.blurb ?? '', i.discussion ?? '', i.image, JSON.stringify(i.images ?? []), i.cover ?? '',
    ],
  );
}

console.log(`Seeded ${items.length} items.`);
