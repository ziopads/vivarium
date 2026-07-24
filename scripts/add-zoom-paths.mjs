#!/usr/bin/env node
/**
 * add-zoom-paths.mjs
 * ---------------------------------------------------------------------------
 * One-off, idempotent patcher: adds a resolved `zoom` filename to every image
 * record in cr-working/works.json, so the app never has to guess a path.
 *
 *   image.zoom = "<stem>_zoom.jpg"   when the source long edge >= 2000px
 *   image.zoom = null                when it does not
 *
 * The threshold exists because `withoutEnlargement: true` means a 3000px
 * request against a 2048px source just re-encodes it at 2048 — worth having
 * (28% more than the 1600px web tier) — but a 860px source has nothing left to
 * give, and a _zoom file that is not actually a zoom would quietly undo what
 * the `x` prefix and photoStatus exist to make visible. Where zoom is null the
 * app falls back: `img.zoom ?? img.web`.
 *
 * Source dimensions are read from cr-working/image-report.json rather than
 * re-measured — that report was written by the completed build and is
 * authoritative. If any image is missing from it, this script ABORTS rather
 * than guessing, because a wrong null silently downgrades a master.
 *
 * Run this BEFORE build-cr-images.mjs.
 *
 * USAGE
 *   node scripts/add-zoom-paths.mjs --dry-run   # report only, write nothing
 *   node scripts/add-zoom-paths.mjs             # patch (backs up first)
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ZOOM_MIN_SOURCE = 2000   // must match build-cr-images.mjs

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WORK_DIR = path.join(ROOT, 'cr-working')
const DATA_FILE = path.join(WORK_DIR, 'works.json')
const REPORT_FILE = path.join(WORK_DIR, 'image-report.json')
const BACKUP = DATA_FILE + '.zoombak'

const DRY = process.argv.slice(2).includes('--dry-run')

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
}
const log = (...a) => console.log(...a)

// ── preflight ──────────────────────────────────────────────────────────────
for (const [label, f] of [['works.json', DATA_FILE], ['image-report.json', REPORT_FILE]]) {
  if (!existsSync(f)) {
    console.error(c.red(`\n  ✗ ${label} not found at:\n    ${f}\n`))
    process.exit(1)
  }
}

const raw = await fs.readFile(DATA_FILE, 'utf8')
const data = JSON.parse(raw)
const works = data.works ?? []

const report = JSON.parse(await fs.readFile(REPORT_FILE, 'utf8'))
const dims = new Map()
for (const r of report.images ?? []) {
  if (r.stem) dims.set(r.stem, { w: r.sourceWidth, h: r.sourceHeight })
}

log(c.bold(`\n  Valerie Tamplin — add _zoom paths to works.json`))
log(c.dim(`  works: ${works.length}   report entries: ${dims.size}   mode: ${DRY ? 'DRY RUN' : 'write'}\n`))

// ── pass 1: verify every image has measured dimensions ─────────────────────
const unmeasured = []
for (const w of works) {
  for (const img of w.images ?? []) {
    const d = dims.get(img.stem)
    if (!d || !d.w || !d.h) unmeasured.push({ id: w.id, stem: img.stem })
  }
}
if (unmeasured.length) {
  console.error(c.red(`  ✗ ${unmeasured.length} image(s) have no measured dimensions in image-report.json:`))
  for (const u of unmeasured.slice(0, 20)) console.error(c.red(`      ${u.id}  ${u.stem}`))
  if (unmeasured.length > 20) console.error(c.dim(`      …and ${unmeasured.length - 20} more`))
  console.error(c.dim('\n    Re-run build-cr-images.mjs to regenerate the report, then retry.'))
  console.error(c.dim('    Aborting rather than guessing — a wrong null downgrades a master.\n'))
  process.exit(1)
}

// ── pass 2: compute and apply ──────────────────────────────────────────────
/** Rebuild the image object with `zoom` inserted after `full`, preserving
 *  every other key and its order. */
function withZoom(img, zoom) {
  const out = {}
  let placed = false
  for (const [k, v] of Object.entries(img)) {
    if (k === 'zoom') continue            // drop the old value; re-added below
    out[k] = v
    if (k === 'full') { out.zoom = zoom; placed = true }
  }
  if (!placed) out.zoom = zoom
  return out
}

let added = 0, unchanged = 0, changed = 0
const nulls = []

for (const w of works) {
  if (!w.images?.length) continue
  w.images = w.images.map(img => {
    const { w: iw, h: ih } = dims.get(img.stem)
    const longEdge = Math.max(iw, ih)
    const eligible = longEdge >= ZOOM_MIN_SOURCE
    const zoom = eligible ? `${img.stem}_zoom.jpg` : null

    if (!eligible) nulls.push({ id: w.id, title: w.title, stem: img.stem, longEdge, source: img.source })

    const had = Object.prototype.hasOwnProperty.call(img, 'zoom')
    if (!had) added++
    else if (img.zoom === zoom) unchanged++
    else changed++

    return withZoom(img, zoom)
  })
}

const total = added + unchanged + changed
log(`  images:    ${total}`)
log(`  zoom set:  ${c.green(total - nulls.length)}   ${c.dim(`(>= ${ZOOM_MIN_SOURCE}px long edge)`)}`)
log(`  zoom null: ${nulls.length ? c.yellow(nulls.length) : 0}   ${c.dim('(app falls back to _web)')}`)
log(c.dim(`  new: ${added}   already correct: ${unchanged}   corrected: ${changed}`))

if (nulls.length) {
  log(c.yellow(`\n  no zoom tier — source too small:`))
  for (const n of nulls) {
    log(c.yellow(`      ${n.id}  ${n.stem}  ${n.longEdge}px  ${c.dim(`[${n.source}] ${n.title ?? '(untitled)'}`)}`))
  }
}

if (added === 0 && changed === 0) {
  log(c.dim('\n  nothing to write — works.json is already current.\n'))
  process.exit(0)
}

if (DRY) {
  log(c.dim('\n  dry run — works.json not modified.\n'))
  process.exit(0)
}

await fs.writeFile(BACKUP, raw)
await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n')
log(c.green(`\n  ✓ works.json patched`))
log(c.dim(`    backup: ${path.relative(ROOT, BACKUP)}`))
log(c.dim(`    next:   node scripts/build-cr-images.mjs --dry-run\n`))
