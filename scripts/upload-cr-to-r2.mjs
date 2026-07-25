// Upload the built CR image tree to Cloudflare R2 under the SAME keys the app
// stores in each record's images[].src — i.e. items/<id6>/<stem>_<tier>.jpg.
//
// This replaces the local public/items-tamplin symlink step for production: the
// same CR# -> id mapping, applied to object keys instead of the filesystem.
//
// The keys come from works.json's already-resolved paths (via the ingest's id
// mapping), NOT reconstructed here — so what lands in R2 matches what the app
// asks for, byte-for-byte on the path. If they diverged you'd get broken images
// with no error, the same failure mode we hit locally.
//
// USAGE (from repo root):
//   node --env-file=.env.local scripts/upload-cr-to-r2.mjs --dry-run
//   node --env-file=.env.local scripts/upload-cr-to-r2.mjs
//   node --env-file=.env.local scripts/upload-cr-to-r2.mjs --no-full   # skip the 1.82 GB _full tier
//
// Requires R2 env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
// Reads the dataset named by LOCAL_DATA_FILE (default data/items.tamplin.json).

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, statSync, existsSync, readlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const argv = new Set(process.argv.slice(2));
const DRY = argv.has('--dry-run');
const NO_FULL = argv.has('--no-full');

const root = process.cwd();

// ── resolve inputs ───────────────────────────────────────────────────────────
const DATA_FILE = path.resolve(root, process.env.LOCAL_DATA_FILE || 'data/items.tamplin.json');
const IMAGE_DIR = (process.env.NEXT_PUBLIC_LOCAL_IMAGE_DIR || 'items-tamplin').replace(/^\/+|\/+$/g, '');
// Where the built files actually live on disk (the symlinked public dir).
const PUBLIC_ROOT = path.join(root, 'public', IMAGE_DIR);

const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing R2 env: ${missing.join(', ')}`);
  process.exit(1);
}
const BUCKET = process.env.R2_BUCKET;

if (!existsSync(DATA_FILE)) {
  console.error(`Data file not found: ${DATA_FILE}`);
  process.exit(1);
}
const items = JSON.parse(readFileSync(DATA_FILE, 'utf8'));

console.log(`Uploading FROM: ${path.relative(root, PUBLIC_ROOT)}/`);
console.log(`Keys FROM:      ${path.relative(root, DATA_FILE)}`);
console.log(`INTO bucket:    ${BUCKET}  (account ${process.env.R2_ACCOUNT_ID})`);
console.log(`Tiers:          ${NO_FULL ? 'zoom, web, thumb (NO _full)' : 'full, zoom, web, thumb'}`);
console.log(`Mode:           ${DRY ? 'DRY RUN' : 'upload'}\n`);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ── collect every (key, localPath) pair from the records ─────────────────────
// The stored src is "<id6>/<stem>"; files[tier] is "<id6>/<stem>_<tier>.jpg".
// The object key is "items/" + that path. On disk the file sits at
// PUBLIC_ROOT/<id6>/<stem>_<tier>.jpg (following the symlink).
const TIERS = NO_FULL ? ['thumb', 'web', 'zoom'] : ['thumb', 'web', 'zoom', 'full'];
const CONTENT_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };

const jobs = [];
let skippedNoZoom = 0;
for (const it of items) {
  for (const img of it.images || []) {
    const files = img.files || {};
    for (const tier of TIERS) {
      const rel = files[tier];
      if (!rel) {
        // zoom is legitimately null for sub-2000px sources; not an error.
        if (tier === 'zoom') skippedNoZoom++;
        continue;
      }
      const key = `items/${rel}`;                     // matches lib/img.ts prefix
      const localPath = path.join(PUBLIC_ROOT, rel);
      jobs.push({ key, localPath, tier });
    }
  }
}

// ── verify every local file exists before uploading anything ─────────────────
const absent = jobs.filter((j) => !existsSync(j.localPath));
if (absent.length) {
  console.error(`✗ ${absent.length} referenced file(s) missing on disk — aborting before any upload:`);
  for (const a of absent.slice(0, 15)) console.error(`    ${path.relative(root, a.localPath)}`);
  if (absent.length > 15) console.error(`    …and ${absent.length - 15} more`);
  console.error(`\n  Is the external drive mounted? Did build-cr-images.mjs run?`);
  process.exit(1);
}

const byTier = TIERS.reduce((m, t) => ((m[t] = jobs.filter((j) => j.tier === t).length), m), {});
console.log(`Planned: ${jobs.length} objects  ${JSON.stringify(byTier)}`);
if (skippedNoZoom) console.log(`(${skippedNoZoom} images have no zoom tier — expected)\n`);

if (DRY) {
  console.log('Dry run — nothing uploaded.');
  console.log('Sample keys:');
  for (const j of jobs.slice(0, 5)) console.log(`    ${j.key}`);
  process.exit(0);
}

// ── upload, skipping objects already present with the same size ──────────────
let uploaded = 0, skipped = 0, bytes = 0, done = 0;
const CONCURRENCY = 8;

async function one(job) {
  const size = statSync(job.localPath).size;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: job.key }));
    if (head.ContentLength === size) { skipped++; return; }
  } catch { /* not present — upload it */ }

  const ext = job.key.split('.').pop().toLowerCase();
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: job.key,
    Body: await readFile(job.localPath),
    ContentType: CONTENT_TYPE[ext] || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  uploaded++;
  bytes += size;
}

const queue = [...jobs];
async function worker() {
  while (queue.length) {
    const job = queue.shift();
    await one(job);
    if (++done % 50 === 0 || done === jobs.length) {
      process.stdout.write(`\r  ${done}/${jobs.length}  (${uploaded} up, ${skipped} skipped)   `);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n\nDone — ${uploaded} uploaded (${(bytes / 1e9).toFixed(2)} GB), ${skipped} already present.`);
