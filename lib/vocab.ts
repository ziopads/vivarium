import fs from 'fs';
import path from 'path';
import { SECTIONS, SHELVES } from './sections';

// Server-only: reads/writes the editable controlled vocabulary. Do NOT import
// this from client components (it touches the filesystem).
export type VocabKind = 'sections' | 'genres' | 'shelves';
export type Vocab = { sections: string[]; genres: string[]; shelves: string[] };

const FILE = path.join(process.cwd(), 'data', 'vocab.json');

export function getVocab(): Vocab {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      sections: Array.isArray(raw.sections) ? raw.sections : [...SECTIONS],
      genres: Array.isArray(raw.genres) ? raw.genres : [],
      shelves: Array.isArray(raw.shelves) ? raw.shelves : [...SHELVES],
    };
  } catch {
    // No file yet — fall back to the built-in defaults.
    return { sections: [...SECTIONS], genres: [], shelves: [...SHELVES] };
  }
}

export function writeVocab(v: Vocab) {
  fs.writeFileSync(FILE, JSON.stringify(v, null, 2));
}
