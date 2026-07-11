import fs from 'fs';
import path from 'path';
import { SECTIONS, SHELVES } from './sections';
import { getSupabase } from './supabase';

// Server-only: reads/writes the editable controlled vocabulary, from Supabase
// when configured, else the local JSON file. Do NOT import from client components.
export type VocabKind = 'sections' | 'genres' | 'shelves';
export type Vocab = { sections: string[]; genres: string[]; shelves: string[] };

const FILE = path.join(process.cwd(), 'data', 'vocab.json');
const DEFAULTS: Vocab = { sections: [...SECTIONS], genres: [], shelves: [...SHELVES] };

function normalize(raw: any): Vocab {
  return {
    sections: Array.isArray(raw?.sections) ? raw.sections : [...SECTIONS],
    genres: Array.isArray(raw?.genres) ? raw.genres : [],
    shelves: Array.isArray(raw?.shelves) ? raw.shelves : [...SHELVES],
  };
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
