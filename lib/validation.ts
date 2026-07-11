import type { Item } from './types';

// Write-boundary normalization. Coerces an item to the canonical shape so the
// flexible JSONB tail can't drift: consistent types, trimmed strings, clamped
// controlled-vocab fields. Unknown/extra fields pass through untouched (via the
// initial spread) so we never silently drop data.

const s = (v: any): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const sArr = (v: any): string[] =>
  Array.isArray(v)
    ? Array.from(new Set(v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())))
    : [];

// Per-type validators enforce type-specific fields. Extend as new item types
// are added (music, frames, …). Each receives the normalized core item.
type TypeValidator = (it: Item) => Item;
const TYPE_VALIDATORS: Record<string, TypeValidator> = {
  // Book's bibliographic fields are already covered by the core pass-through.
  // e.g. Frame: (it) => ({ ...it, /* validate dimension fields in attributes */ }),
};

export function validateItem(raw: any): Item {
  if (!raw || typeof raw !== 'object') throw new Error('Item must be an object');
  if (typeof raw.id !== 'number') throw new Error(`Item id must be a number (got ${JSON.stringify(raw.id)})`);

  const it: any = { ...raw };
  it.itemType = s(raw.itemType) || 'Book';
  it.title = s(raw.title).trim();
  it.author = s(raw.author);
  it.year = s(raw.year);
  it.shelf = s(raw.shelf);
  it.genres = sArr(raw.genres);
  it.subjects = sArr(raw.subjects);
  it.places = sArr(raw.places);
  it.visibility = raw.visibility === 'restricted' ? 'restricted' : 'public';
  it.owner = s(raw.owner);
  it.signed = !!raw.signed;
  it.maine = !!raw.maine;
  it.description = s(raw.description);
  it.image = typeof raw.image === 'string' ? raw.image : null;
  it.images = Array.isArray(raw.images)
    ? raw.images
        .filter((im: any) => im && typeof im.src === 'string')
        .map((im: any) => ({ src: im.src, label: s(im.label) }))
    : [];
  if (raw.section != null) it.section = s(raw.section);
  if (raw.discussion != null) it.discussion = s(raw.discussion);
  if (raw.cover != null) it.cover = s(raw.cover);
  if (raw.copyright != null) it.copyright = s(raw.copyright);

  const typeCheck = TYPE_VALIDATORS[it.itemType];
  return typeCheck ? typeCheck(it as Item) : (it as Item);
}
