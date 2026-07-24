#!/usr/bin/env node
/**
 * build-cr-images.mjs
 * ---------------------------------------------------------------------------
 * Prepares the Valerie Tamplin catalogue raisonné image tree for vivarium.
 *
 *   1. Renames every image in the "recovered 2" folder with an `x` prefix, so
 *      spreadsheet-recovered images are visually distinct from professionally
 *      photographed masters. Idempotent — already-prefixed files are skipped.
 *
 *   2. For every work in works.json, builds  cr-working/images/<CR#>/  holding:
 *        <stem>_full.jpg   verbatim copy of the original
 *        <stem>_zoom.jpg   longest edge 3000px, q85, sRGB  (see below)
 *        <stem>_web.jpg    longest edge 1600px, q82, sRGB
 *        <stem>_thumb.jpg  longest edge  400px, q80, sRGB
 *
 *      The zoom tier is only built when the source long edge is >= 2000px and
 *      works.json declares a `zoom` filename for that image (run
 *      scripts/add-zoom-paths.mjs first). Below that threshold there is
 *      nothing to zoom into and the app falls back to _web.
 *
 *   3. Writes cr-working/image-report.json with real dimensions and byte sizes
 *      for every source and derivative.
 *
 * USAGE
 *   node scripts/build-cr-images.mjs --dry-run     # report only, touch nothing
 *   node scripts/build-cr-images.mjs               # build (skips up-to-date)
 *   node scripts/build-cr-images.mjs --force       # rebuild all derivatives
 *   node scripts/build-cr-images.mjs --skip-rename # don't touch "recovered 2"
 *
 * REQUIRES  sharp   ->  npm install sharp
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('\n  ✗ sharp is not installed.\n    Run:  npm install sharp\n')
  process.exit(1)
}

// ── configuration ──────────────────────────────────────────────────────────
const HOME = process.env.HOME
const PRO_DIR = path.join(HOME, 'Desktop/VMT CR OF RECORD')
const REC_DIR = path.join(HOME, 'Desktop/recovered 2')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WORK_DIR = path.join(ROOT, 'cr-working')
const DATA_FILE = path.join(WORK_DIR, 'works.json')
const OUT_DIR = path.join(WORK_DIR, 'images')
const REPORT = path.join(WORK_DIR, 'image-report.json')

const ZOOM_EDGE = 3000
const WEB_EDGE = 1600
const THUMB_EDGE = 400
const ZOOM_QUALITY = 85
const WEB_QUALITY = 82
const THUMB_QUALITY = 80
const ZOOM_MIN_SOURCE = 2000   // must match add-zoom-paths.mjs
const X_PREFIX = 'x'

const argv = new Set(process.argv.slice(2))
const DRY = argv.has('--dry-run')
const FORCE = argv.has('--force')
const SKIP_RENAME = argv.has('--skip-rename')

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
}

const log = (...a) => console.log(...a)
const bytes = n =>
  n > 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GB`
    : n > 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB`
      : `${(n / 1024).toFixed(0)} KB`

// ── preflight ──────────────────────────────────────────────────────────────
for (const [label, dir] of [['professional', PRO_DIR], ['recovered', REC_DIR]]) {
  if (!existsSync(dir)) {
    console.error(c.red(`  ✗ ${label} folder not found:\n    ${dir}`))
    process.exit(1)
  }
}
if (!existsSync(DATA_FILE)) {
  console.error(c.red(`  ✗ works.json not found at:\n    ${DATA_FILE}`))
  console.error(c.dim('    Place the generated works.json there and re-run.'))
  process.exit(1)
}

const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'))
const works = data.works ?? []

log(c.bold(`\n  Valerie Tamplin — CR image build`))
log(c.dim(`  works: ${works.length}   mode: ${DRY ? 'DRY RUN' : FORCE ? 'FORCE REBUILD' : 'incremental'}\n`))

// ── step 1: x-prefix the recovered folder ──────────────────────────────────
// In a dry run nothing is actually renamed, so step 2 would look for the
// x-prefixed names and report every recovered image as missing. This map lets
// resolveSource() fall back to the pre-rename name, keeping the dry run honest.
const pendingRenames = new Map()   // newName -> oldName
const renamed = []
if (!SKIP_RENAME) {
  const files = (await fs.readdir(REC_DIR)).filter(f => !f.startsWith('.'))
  for (const f of files) {
    if (f.startsWith(X_PREFIX + 'VMT-')) continue        // already done
    if (!/^VMT-\d{4}-\d{3}[a-z]?\.(jpe?g|png)$/i.test(f)) {
      log(c.yellow(`    ~ not renamed (no CR# assigned yet): ${f}`))
      continue
    }
    const to = X_PREFIX + f
    if (existsSync(path.join(REC_DIR, to))) {
      log(c.yellow(`    ~ target exists, skipping: ${to}`))
      continue
    }
    if (!DRY) await fs.rename(path.join(REC_DIR, f), path.join(REC_DIR, to))
    else pendingRenames.set(to, f)
    renamed.push([f, to])
  }
  log(`  1. x-prefix rename: ${c.green(renamed.length)} renamed` +
      (renamed.length ? c.dim(`  (e.g. ${renamed[0][0]} → ${renamed[0][1]})`) : c.dim('  (nothing to do)')))
} else {
  log(c.dim('  1. x-prefix rename: skipped'))
}

// ── helpers ────────────────────────────────────────────────────────────────
/** Find a source file case-insensitively, tolerating .jpg/.JPG/.jpeg. */
async function resolveSource(dir, wanted) {
  const direct = path.join(dir, wanted)
  if (existsSync(direct)) return direct

  // dry run: the x-prefix rename hasn't happened yet, so look under the old name
  if (pendingRenames.has(wanted)) {
    const pre = path.join(dir, pendingRenames.get(wanted))
    if (existsSync(pre)) return pre
  }

  const stem = wanted.replace(/\.[^.]+$/, '')
  const entries = await fs.readdir(dir)
  const hit = entries.find(e => {
    const s = e.replace(/\.[^.]+$/, '')
    return s.toLowerCase() === stem.toLowerCase() && /\.(jpe?g|png)$/i.test(e)
  })
  return hit ? path.join(dir, hit) : null
}

async function isStale(src, dest) {
  if (FORCE || !existsSync(dest)) return true
  const [a, b] = await Promise.all([fs.stat(src), fs.stat(dest)])
  return a.mtimeMs > b.mtimeMs
}

// ── step 2: build derivatives ──────────────────────────────────────────────
const report = []
const missing = []
const zoomDrift = []
let built = 0, skippedUpToDate = 0, totalOut = 0, treeBytes = 0

for (const w of works) {
  if (!w.images?.length) continue
  const dir = path.join(OUT_DIR, w.id)
  if (!DRY) await fs.mkdir(dir, { recursive: true })

  for (const img of w.images) {
    const srcDir = img.source === 'professional' ? PRO_DIR : REC_DIR
    const src = await resolveSource(srcDir, img.sourceFile)

    if (!src) {
      missing.push({ id: w.id, title: w.title, expected: img.sourceFile, in: srcDir })
      continue
    }

    // Read metadata even in a dry run — it is a header read, and the zoom
    // decision depends on the real source dimensions.
    const meta = await sharp(src).metadata()
    const srcStat = await fs.stat(src)
    const entry = {
      id: w.id, title: w.title, stem: img.stem, source: img.source,
      sourceFile: path.basename(src), sourceBytes: srcStat.size,
      sourceWidth: meta?.width ?? null, sourceHeight: meta?.height ?? null,
      outputs: {},
    }

    // Zoom tier: needs both a declared path and enough source to be worth it.
    // Disagreement between the two means add-zoom-paths.mjs is stale — say so
    // rather than silently doing the wrong thing.
    const longEdge = Math.max(meta?.width ?? 0, meta?.height ?? 0)
    const eligible = longEdge >= ZOOM_MIN_SOURCE
    const declared = Boolean(img.zoom)
    if (declared !== eligible) {
      zoomDrift.push({
        id: w.id, stem: img.stem, longEdge, declared, eligible,
      })
    }
    const wantsZoom = declared && eligible

    const targets = [
      ['full', path.join(dir, img.full), null, null],
      ...(wantsZoom ? [['zoom', path.join(dir, img.zoom), ZOOM_EDGE, ZOOM_QUALITY]] : []),
      ['web', path.join(dir, img.web), WEB_EDGE, WEB_QUALITY],
      ['thumb', path.join(dir, img.thumb), THUMB_EDGE, THUMB_QUALITY],
    ]

    for (const [kind, dest, edge, quality] of targets) {
      if (!(await isStale(src, dest))) {
        // Still record it. Otherwise an incremental run produces a report in
        // which only the newly built tier exists, and the report is how we
        // read the state of the tree.
        skippedUpToDate++
        if (existsSync(dest)) {
          const st = await fs.stat(dest)
          entry.outputs[kind] = { file: path.basename(dest), bytes: st.size, current: true }
          treeBytes += st.size
        }
        continue
      }
      if (DRY) { built++; continue }

      if (kind === 'full') {
        await fs.copyFile(src, dest)                  // verbatim, no re-encode
      } else {
        await sharp(src)
          .rotate()                                   // honour EXIF orientation
          .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
          .toColorspace('srgb')
          .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
          .toFile(dest)
      }
      const st = await fs.stat(dest)
      entry.outputs[kind] = { file: path.basename(dest), bytes: st.size }
      totalOut += st.size
      treeBytes += st.size
      built++
    }
    report.push(entry)
  }
}

log(`  2. derivatives:     ${c.green(built)} written` +
    (skippedUpToDate ? c.dim(`, ${skippedUpToDate} already current`) : '') +
    (DRY ? c.dim('  (dry run — nothing written)') : ''))

if (missing.length) {
  log(c.red(`\n  ✗ ${missing.length} source image(s) referenced by works.json were not found:`))
  for (const m of missing.slice(0, 20)) log(c.red(`      ${m.id}  expected ${m.expected}`))
  if (missing.length > 20) log(c.dim(`      …and ${missing.length - 20} more`))
}

if (zoomDrift.length) {
  log(c.yellow(`\n  ⚠ ${zoomDrift.length} image(s) disagree with works.json about the zoom tier —`))
  log(c.yellow(`    re-run  node scripts/add-zoom-paths.mjs  to resync:`))
  for (const z of zoomDrift.slice(0, 20)) {
    const why = z.declared
      ? `declares zoom but source is only ${z.longEdge}px`
      : `no zoom declared but source is ${z.longEdge}px`
    log(c.yellow(`      ${z.id}  ${z.stem}  ${why}`))
  }
  if (zoomDrift.length > 20) log(c.dim(`      …and ${zoomDrift.length - 20} more`))
}

// ── step 3: report ─────────────────────────────────────────────────────────
if (!DRY) {
  const dims = report.filter(r => r.sourceWidth)
  const bySource = k => dims.filter(r => r.source === k).map(r => Math.max(r.sourceWidth, r.sourceHeight))
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null

  const tierBytes = kind =>
    report.reduce((n, r) => n + (r.outputs[kind]?.bytes ?? 0), 0)
  const tierCount = kind => report.filter(r => r.outputs[kind]).length

  await fs.writeFile(REPORT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    works: works.length,
    imagesProcessed: report.length,
    missingSources: missing,
    zoomDrift,
    bytesWrittenThisRun: totalOut,
    treeBytes,
    tiers: Object.fromEntries(
      ['full', 'zoom', 'web', 'thumb'].map(k => [k, { count: tierCount(k), bytes: tierBytes(k) }])
    ),
    outputBytes: totalOut,
    sourceLongEdge: {
      professional: { count: bySource('professional').length, median: med(bySource('professional')), max: Math.max(0, ...bySource('professional')) },
      recovered: { count: bySource('recovered').length, median: med(bySource('recovered')), max: Math.max(0, ...bySource('recovered')) },
    },
    images: report,
  }, null, 2))

  log(c.dim(`\n  written this run: ${bytes(totalOut)}`))
  log(c.dim(`  tree total:       ${bytes(treeBytes)}`))
  for (const k of ['full', 'zoom', 'web', 'thumb']) {
    if (tierCount(k)) log(c.dim(`    ${k.padEnd(6)} ${String(tierCount(k)).padStart(4)} files  ${bytes(tierBytes(k))}`))
  }
  log(c.dim(`  report:      ${path.relative(ROOT, REPORT)}`))
  log(c.dim(`  images:      ${path.relative(ROOT, OUT_DIR)}/<CR#>/`))

  const p = bySource('professional'), r = bySource('recovered')
  if (p.length) log(c.dim(`  professional long edge: median ${med(p)}px, max ${Math.max(...p)}px`))
  if (r.length) log(c.dim(`  recovered long edge:    median ${med(r)}px, max ${Math.max(...r)}px`))
}

const noImage = works.filter(w => !w.images?.length)
if (noImage.length) {
  log(c.yellow(`\n  ${noImage.length} work(s) still have no image at all:`))
  for (const w of noImage) log(c.yellow(`      ${w.id}  ${w.title ?? '(untitled)'}`))
}

log('')
