import fs from 'fs';
import path from 'path';
import { SECTIONS } from './sections';
import { getSupabase } from './supabase';

// Server-only. Shelves are now scoped to their section (shelvesBySection), so
// e.g. "Maine" under Art and "Maine" under Regions/Cultures are distinct, and
// "Martial Arts" lives only under Physical Culture & Sports. Genres/subjects
// stay flat (they're cross-cutting).
export type VocabKind = 'sections' | 'genres' | 'shelves';
export type Vocab = {
  sections: string[];
  genres: string[];
  shelvesBySection: Record<string, string[]>;
};

const FILE = path.join(process.cwd(), 'data', 'vocab.json');
const DEFAULTS: Vocab = { sections: [...SECTIONS], genres: [], shelvesBySection: {} };

function normalize(raw: any): Vocab {
  return {
    sections: Array.isArray(raw?.sections) ? raw.sections : [...SECTIONS],
    genres: Array.isArray(raw?.genres) ? raw.genres : [],
    shelvesBySection:
      raw?.shelvesBySection && typeof raw.shelvesBySection === 'object' ? raw.shelvesBySection : {},
  };
}

// Every shelf across all sections, de-duped — for surfaces not yet section-aware.
export function flatShelves(v: Vocab): string[] {
  return Array.from(new Set(Object.values(v.shelvesBySection).flat())).sort();
}

export function shelvesFor(v: Vocab, section: string | undefined): string[] {
  return (section && v.shelvesBySection[section]) || [];
}

export async function getVocab(): Promise<Vocab> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('vocab').select('data').eq('id', 1).maybeSingle();
    if (error) throw new Error(`Supabase getVocab: ${error.message}`);
    return data?.data ? normalize(data.data) : DEFAULTS;
  }
  try {
    return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    return DEFAULTS;
  }
}

export async function writeVocab(v: Vocab): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from('vocab').upsert({ id: 1, data: v }, { onConflict: 'id' });
    if (error) throw new Error(`Supabase writeVocab: ${error.message}`);
    return;
  }
  fs.writeFileSync(FILE, JSON.stringify(v, null, 2));
}
