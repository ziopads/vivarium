import fs from 'fs';
import path from 'path';
import { getSupabase } from './supabase';
import { dataSource } from './data';
import { PUBLICABLE_FIELDS, NEVER_PUBLIC_FIELDS, DEFAULT_PUBLIC_FIELDS } from './fieldVisibility';
import {
  sanitizeTree,
  treeFromLegacy,
  sectionsFromTree,
  shelvesBySectionFromTree,
  type TaxonNode,
} from './taxonomy';
import { TYPE_OPTIONS } from './itemTypes';

// Server-only. `tree` is the classification: one ordered, arbitrarily deep tree
// of names (see lib/taxonomy.ts). `sections` and `shelvesBySection` are DERIVED
// from its first two levels and are not independently editable — they exist so
// the surfaces still written against section/shelf keep working while they are
// moved over. Genres stay flat, being cross-cutting.
export type VocabKind = 'sections' | 'genres' | 'shelves' | 'types';
export type Vocab = {
  /** The classification tree. The stored source of truth for section and shelf. */
  tree: TaxonNode[];
  /** Derived: top-level node names, in tree order. Do not edit directly. */
  sections: string[];
  genres: string[];
  /**
   * Item types, in the order they should appear in pickers.
   *
   * The LIST is editable here; the FIELDS a type carries are not. Frame's
   * dimensions and the artwork types' medium and provenance are declared in
   * lib/itemTypes.ts because they need labels and rendering, so a type added
   * here is one with no type-specific fields — which is exactly what Book is.
   */
  types: string[];
  /** Derived: each top-level node's children, in tree order. Do not edit directly. */
  shelvesBySection: Record<string, string[]>;
  /** Attribute keys currently exposed to the public tier. A subset of
   *  PUBLICABLE_FIELDS; edited in /admin/vocab; read by publicView at request
   *  time so a toggle is live without a deploy. Optional so existing Vocab
   *  literals keep compiling; normalize() always fills it, so reads never see
   *  undefined. */
  publicFields?: string[];
};

/**
 * Vocabulary must live in the same store as the items it describes. Two bugs
 * would otherwise bite: getVocab checked Supabase independently of the item
 * mode, so LOCAL_DATA_FILE could give you one instance's items with another's
 * sections; and the file path was hardcoded, so every local instance shared
 * data/vocab.json.
 *
 * Path resolution: VOCAB_FILE wins; otherwise it is derived from the active
 * data file by swapping the leading `items` in the basename for `vocab`
 * (items.tamplin.json → vocab.tamplin.json), which keeps the one-env-line
 * switch intact.
 */
function vocabFile(): string {
  const explicit = process.env.VOCAB_FILE?.trim();
  if (explicit) return path.resolve(process.cwd(), explicit);

  const src = dataSource();
  if (src.file) {
    const dir = path.dirname(src.file);
    const base = path.basename(src.file);
    return path.join(dir, base.startsWith('items') ? 'vocab' + base.slice('items'.length) : `vocab.${base}`);
  }
  return path.join(process.cwd(), 'data', 'vocab.json');
}

const DEFAULTS: Vocab = {
  tree: [],
  sections: [],
  genres: [],
  types: [...TYPE_OPTIONS],
  shelvesBySection: {},
  publicFields: [...DEFAULT_PUBLIC_FIELDS],
};

const PUBLICABLE = new Set<string>(PUBLICABLE_FIELDS);
const NEVER = new Set<string>(NEVER_PUBLIC_FIELDS);

/**
 * Sanitize the stored allowlist on every read. A hand-edited or corrupted
 * vocab file can never widen what publicView exposes: only keys that are
 * publicable AND not never-public survive. This is defence in depth — publicView
 * intersects too, but enforcing here means the rest of the app also sees a
 * clean list.
 */
function cleanPublicFields(raw: any): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PUBLIC_FIELDS];
  return raw.filter((k) => typeof k === 'string' && PUBLICABLE.has(k) && !NEVER.has(k));
}

const byName = (a: string, b: string) => a.localeCompare(b);

/**
 * Genres are alphabetised; the tree is left exactly as stored.
 *
 * This function used to sort sections and every shelf list as well, on the way
 * in and on the way out. That made curated order impossible — whatever order the
 * vocabulary was saved in, every read handed back an alphabetical one, so the
 * ordering the landing page believed it was applying had nothing to apply. The
 * tree exists to hold an order chosen deliberately, so nothing here may reorder
 * it, and the derived section and shelf lists inherit that order.
 *
 * publicFields is left alone too: an allowlist, not a menu, and its order is
 * never shown to anyone.
 */
export function tidyVocab(v: Vocab): Vocab {
  const tree = sanitizeTree(v.tree);
  return {
    ...v,
    tree,
    sections: sectionsFromTree(tree),
    shelvesBySection: shelvesBySectionFromTree(tree),
    genres: [...v.genres].sort(byName),
    // Types keep their stored order for the same reason the tree does: Book
    // belongs at the top of the picker, and alphabetising would bury it.
    types: Array.from(new Set(v.types.map((t) => t.trim()).filter(Boolean))),
  };
}

/**
 * A vocabulary saved before the tree existed carries sections and
 * shelvesBySection and no tree. The first read builds one from them, in the
 * order they were stored, and from then on the tree is what is read and written.
 * Nothing is invented: the tree starts exactly two levels deep, matching what
 * was there.
 */
function normalize(raw: any): Vocab {
  const stored = sanitizeTree(raw?.tree);
  const tree = stored.length
    ? stored
    : treeFromLegacy(
        Array.isArray(raw?.sections) ? raw.sections : [],
        raw?.shelvesBySection && typeof raw.shelvesBySection === 'object' ? raw.shelvesBySection : {},
      );
  return tidyVocab({
    tree,
    sections: [],
    genres: Array.isArray(raw?.genres) ? raw.genres : [],
    // Seeded from the code list on first read, then stored — the same migration
    // the tree gets. After that the stored list is what pickers show, so adding
    // a type in the editor is not undone by the next deploy.
    types: Array.isArray(raw?.types) && raw.types.length ? raw.types : [...TYPE_OPTIONS],
    shelvesBySection: {},
    publicFields: cleanPublicFields(raw?.publicFields),
  });
}

// Every shelf across all sections, de-duped — for surfaces not yet section-aware.
export function flatShelves(v: Vocab): string[] {
  return Array.from(new Set(Object.values(v.shelvesBySection).flat())).sort();
}

export function shelvesFor(v: Vocab, section: string | undefined): string[] {
  return (section && v.shelvesBySection[section]) || [];
}

export async function getVocab(): Promise<Vocab> {
  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
    const { data, error } = await sb.from('vocab').select('data').eq('id', 1).maybeSingle();
    if (error) throw new Error(`Supabase getVocab: ${error.message}`);
    return data?.data ? normalize(data.data) : DEFAULTS;
  }
  try {
    return normalize(JSON.parse(fs.readFileSync(vocabFile(), 'utf8')));
  } catch {
    // Absent vocab is the first-run case for a new instance. Unlike items,
    // there is nothing to lose by starting from defaults.
    return DEFAULTS;
  }
}

export async function writeVocab(v: Vocab): Promise<void> {
  // The derived mirrors are persisted alongside the tree, not because anything
  // reads them back — normalize rebuilds them — but so a rollback to a build that
  // predates the tree still finds the sections and shelves where it expects them.
  const tidy = tidyVocab(v);
  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
    const { error } = await sb.from('vocab').upsert({ id: 1, data: tidy }, { onConflict: 'id' });
    if (error) throw new Error(`Supabase writeVocab: ${error.message}`);
    return;
  }
  fs.writeFileSync(vocabFile(), JSON.stringify(tidy, null, 2));
}
