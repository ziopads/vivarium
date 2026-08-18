import fs from 'fs';
import path from 'path';
import { SECTIONS } from './sections';
import { getSupabase } from './supabase';
import { dataSource } from './data';
import { PUBLICABLE_FIELDS, NEVER_PUBLIC_FIELDS, DEFAULT_PUBLIC_FIELDS } from './fieldVisibility';

// Server-only. Shelves are now scoped to their section (shelvesBySection), so
// e.g. "Maine" under Art and "Maine" under Regions/Cultures are distinct, and
// "Martial Arts" lives only under Physical Culture & Sports. Genres/subjects
// stay flat (they're cross-cutting).
export type VocabKind = 'sections' | 'genres' | 'shelves';
export type Vocab = {
  sections: string[];
  genres: string[];
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
  sections: [...SECTIONS],
  genres: [],
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
 * Alphabetise sections, genres, and every shelf list (plus the shelvesBySection
 * keys themselves, so the admin editor's section picker matches the sections panel).
 *
 * Storage order is insertion order — /api/vocab appends with push — which put newly
 * added sections at the bottom of every dropdown in the app. Rather than sort at each
 * of the many render sites, sorting happens here, on the way in and on the way out:
 * normalize() covers every read (Supabase and file alike), writeVocab covers every
 * write so the persisted JSON stays tidy too.
 *
 * publicFields is deliberately left alone — it is an allowlist, not a menu, and its
 * order is never shown to anyone.
 */
export function sortVocab(v: Vocab): Vocab {
  const shelvesBySection: Record<string, string[]> = {};
  for (const key of Object.keys(v.shelvesBySection).sort(byName)) {
    shelvesBySection[key] = [...(v.shelvesBySection[key] || [])].sort(byName);
  }
  return {
    ...v,
    sections: [...v.sections].sort(byName),
    genres: [...v.genres].sort(byName),
    shelvesBySection,
  };
}

function normalize(raw: any): Vocab {
  return sortVocab({
    sections: Array.isArray(raw?.sections) ? raw.sections : [...SECTIONS],
    genres: Array.isArray(raw?.genres) ? raw.genres : [],
    shelvesBySection:
      raw?.shelvesBySection && typeof raw.shelvesBySection === 'object' ? raw.shelvesBySection : {},
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
  const sorted = sortVocab(v);
  if (dataSource().mode === 'supabase') {
    const sb = getSupabase()!;
    const { error } = await sb.from('vocab').upsert({ id: 1, data: sorted }, { onConflict: 'id' });
    if (error) throw new Error(`Supabase writeVocab: ${error.message}`);
    return;
  }
  fs.writeFileSync(vocabFile(), JSON.stringify(sorted, null, 2));
}
