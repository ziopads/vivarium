// Studio shapes and input rules, shared by server and client.
//
// No imports, so client components can use these without pulling the
// service-role Supabase client (lib/studio.ts) into the browser bundle.

export type StudioArtist = { id: number; code: string; name: string };

export type StudioProject = {
  id: number;
  artist: StudioArtist;
  /** The Ableton folder name. Permanent: the database refuses to change it. */
  canonicalId: string;
  workingName: string;
  /** 0 = unrated, 1–5 stars. One shared rating per project. */
  rating: number;
  /** Free text; '' when not set. */
  genre: string;
  /** Beats per minute; null when not set. */
  bpm: number | null;
  createdBy: string;
  createdAt: string;
};

export const CANONICAL_ID_MAX = 80;
export const WORKING_NAME_MAX = 200;
export const RATING_MAX = 5;

export const GENRE_MAX = 60;
export const BPM_MIN = 20;
export const BPM_MAX = 400;

export function parseGenre(raw: unknown): { value: string } | { error: string } {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'The genre must be text.' };
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length > GENRE_MAX) return { error: `Keep the genre under ${GENRE_MAX} characters.` };
  return { value };
}

/** Accepts a number or numeric text; '' or null clears it. Two decimal places, like the column. */
export function parseBpm(raw: unknown): { value: number | null } | { error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { value: null };
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n < BPM_MIN || n > BPM_MAX) {
    return { error: `BPM must be a number from ${BPM_MIN} to ${BPM_MAX}.` };
  }
  return { value: Math.round(n * 100) / 100 };
}

export function parseRating(raw: unknown): { value: number } | { error: string } {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > RATING_MAX) {
    return { error: `The rating must be a whole number from 0 to ${RATING_MAX}.` };
  }
  return { value: raw };
}

/**
 * A canonical ID is whatever the project's folder is called, usually a date
 * ('2026 0926'), so the format is not enforced. What is refused: empty, too
 * long, surrounding whitespace (trimmed here, and rejected by the database
 * CHECK if it ever arrived untrimmed), control characters, and path separators,
 * which cannot be part of a folder name anyway.
 */
export function parseCanonicalId(raw: unknown): { value: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Enter a canonical ID.' };
  const value = raw.trim();
  if (!value) return { error: 'Enter a canonical ID.' };
  if (value.length > CANONICAL_ID_MAX) return { error: `Keep the canonical ID under ${CANONICAL_ID_MAX} characters.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f/\\:]/.test(value)) {
    return { error: 'The canonical ID cannot contain slashes, colons or control characters.' };
  }
  return { value };
}

export function parseWorkingName(raw: unknown): { value: string } | { error: string } {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'The working name must be text.' };
  const value = raw.trim();
  if (value.length > WORKING_NAME_MAX) return { error: `Keep the working name under ${WORKING_NAME_MAX} characters.` };
  return { value };
}

/** Today in the viewer's own time zone, in the studio's folder format: '2026 0926'. */
export function todayCanonicalId(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()} ${mm}${dd}`;
}
