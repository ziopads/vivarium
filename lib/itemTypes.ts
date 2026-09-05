export type FieldDef = { key: string; label: string };
export type TypeDef = { label: string; fields: FieldDef[] };

// Per-type field definitions. Type-specific values are stored as flat
// properties on the item and land in the DB `attributes` bag automatically.
// Add a type here to make its fields appear in the editor and on the detail page.
// Works of art, whether by a catalogued artist or acquired from elsewhere.
// `refNumber` is deliberately neutral: a catalogue raisonné number and an
// accession number are the same kind of object — a namespaced canonical
// label — differing only in whether they assert authorship or custody.
//
// NOTE: the second group below is commercially sensitive (provenance,
// prices, invoices, locations). Until field-level visibility exists, an
// instance holding real values should sit behind the shared password.
const ARTWORK_FIELDS: FieldDef[] = [
  { key: 'refNumber', label: 'Catalogue / accession no.' },
  { key: 'medium', label: 'Medium' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'framing', label: 'Framing' },
  { key: 'exhibitions', label: 'Exhibitions' },
  { key: 'bibliography', label: 'Bibliography' },
  { key: 'status', label: 'Status' },

  { key: 'provenance', label: 'Provenance / location' },
  { key: 'price', label: 'Price' },
  { key: 'realizedPrice', label: 'Realized price' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'saleHistory', label: 'Sale history' },
  { key: 'index', label: 'Index' },
];

// The artwork types share one field set — they differ in what the object is,
// not in what is recorded about it. `medium` keeps the fine grain, so an oil
// and a watercolour are both Painting.
export const ARTWORK_TYPES = [
  'Painting',
  'Drawing',
  'Print',
  'Sculpture',
  'Collage & Assemblage',
] as const;

export const ITEM_TYPES: Record<string, TypeDef> = {
  Frame: {
    label: 'Picture frame',
    fields: [
      { key: 'frameOuterW', label: 'Outer width' },
      { key: 'frameOuterH', label: 'Outer height' },
      { key: 'frameSightW', label: 'Sight width (visible opening)' },
      { key: 'frameSightH', label: 'Sight height (visible opening)' },
      { key: 'frameDepth', label: 'Frame depth' },
      { key: 'frameRabbetDepth', label: 'Rabbet / canvas depth' },
      { key: 'frameMaterial', label: 'Material / finish' },
    ],
  },
  ...Object.fromEntries(
    ARTWORK_TYPES.map((t) => [t, { label: t, fields: ARTWORK_FIELDS }]),
  ),
};

// Suggestions for the type picker; free text is still allowed.
// `Recording` covers the phonograph records, flexi-discs and cassettes the
// batch pipeline keeps finding — it has no fields of its own yet, which is
// fine: typeFields returns an empty list and the record keeps its bibliographic
// tail. `Music` means printed music.
export const TYPE_OPTIONS = [
  'Book',
  'Music',
  'Recording',
  'Art',
  ...ARTWORK_TYPES,
  'Instrument',
  'Object',
  'Frame',
];

export function typeFields(itemType: string): FieldDef[] {
  return ITEM_TYPES[itemType]?.fields ?? [];
}
