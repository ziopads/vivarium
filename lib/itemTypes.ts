export type FieldDef = { key: string; label: string };
export type TypeDef = { label: string; fields: FieldDef[] };

// Per-type field definitions. Type-specific values are stored as flat
// properties on the item and land in the DB `attributes` bag automatically.
// Add a type here to make its fields appear in the editor and on the detail page.
//
// WHICH TYPES AN INSTANCE OFFERS IS NOT DECIDED HERE. That list lives in
// `vocab.types` — stored per instance, editable in /admin/vocab, seeded from
// TYPE_OPTIONS below on a vocabulary's first read. This file declares what a
// type RECORDS; the vocabulary decides which types are on the menu. A type added
// through the editor has no fields, which is exactly what Book is.
//
// Works of art, whether by a catalogued artist or acquired from elsewhere.
// `refNumber` is deliberately neutral: a catalogue raisonné number and an
// accession number are the same kind of object — a namespaced canonical
// label — differing only in whether they assert authorship or custody.
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

// Studio equipment: instruments, interfaces, preamps, monitors, outboard.
//
// MOST OF WHAT A PIECE OF GEAR RECORDS IS ALREADY ON THE SPINE, and duplicating
// it here would give two places to state one fact with nothing keeping them
// agreed. The maker is `author` (the column is author / artist / maker, and the
// editor labels it so), the model is `title`, the form factor is `format`, the
// year is `year`, the grade is `condition`, what it cost is `pricePaid` and
// where it lives is `location` — the last two already admin-only. So a Juno-106
// is author Roland, title Juno-106, format Keyboard synthesizer.
//
// `dimensions` reuses the artwork key on purpose: same meaning, one place in
// PUBLICABLE_FIELDS, and rack units are a footprint like any other.
const HARDWARE_FIELDS: FieldDef[] = [
  { key: 'serialNumber', label: 'Serial number' },
  { key: 'firmware', label: 'Firmware / OS version' },
  { key: 'connections', label: 'Connections (I/O)' },
  // Voltage and supply type, which decides whether an imported or vintage unit
  // can be plugged in at all.
  { key: 'power', label: 'Power' },
  { key: 'dimensions', label: 'Dimensions / rack units' },
  { key: 'purchaseDate', label: 'Purchased' },
  { key: 'serviceHistory', label: 'Service history' },
];

// Licensed software: instruments, effects, hosts, sample libraries.
//
// Same rule as hardware — the developer is `author`, the product is `title`.
// What is left is the licence and what it takes to open the thing.
//
// SUITES AND COMPONENTS. A suite is one purchase and many usable things, and
// those are two different questions: what is owned, and what can be opened. The
// purchase unit gets its own record holding the licence — key, seats,
// activation, renewal. Each component is its own record carrying its own
// `version`, naming its parent in `licenseUnit`. Component versions drift
// independently, which is why the component is the record and the suite is the
// licence.
//
// `host` and `hostMinVersion` are what make a sample library honest. A Kontakt
// library's load-bearing fact is which host opens it and whether Player will do
// so, and the Kontakt bundled with a library is a different entitlement from
// the Kontakt in a Komplete purchase — two records, visibly different, which is
// the truthful representation rather than an inconvenience.
//
// `licenseKey` is stored here by decision, and is hardcoded never-public in
// lib/fieldVisibility.ts. It rides in backups and JSON exports like any other
// column; that is the cost of having it in the catalogue at all.
const SOFTWARE_FIELDS: FieldDef[] = [
  { key: 'version', label: 'Version' },
  { key: 'licenseType', label: 'License type' },
  { key: 'licenseKey', label: 'License key' },
  // iLok, machine-locked, account sign-in, or none. Which iLok goes in
  // `location`, alongside where a piece of hardware sits.
  { key: 'activation', label: 'Activation' },
  { key: 'seats', label: 'Seats' },
  // VST3 / AU / AAX / standalone — what actually decides whether a session opens.
  { key: 'formats', label: 'Plugin formats' },
  { key: 'host', label: 'Host required' },
  { key: 'hostMinVersion', label: 'Minimum host version' },
  { key: 'licenseUnit', label: 'Licensed as part of' },
  { key: 'renewalDate', label: 'Renews / expires' },
  { key: 'purchaseDate', label: 'Purchased' },
];

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
  Hardware: { label: 'Hardware', fields: HARDWARE_FIELDS },
  Software: { label: 'Software', fields: SOFTWARE_FIELDS },
  ...Object.fromEntries(
    ARTWORK_TYPES.map((t) => [t, { label: t, fields: ARTWORK_FIELDS }]),
  ),
};

// SEED ONLY. The starting `vocab.types` for an instance with no stored
// vocabulary — after the first read, the stored list is what the pickers show,
// so adding a type in /admin/vocab is not undone by the next deploy and a type
// added here does not appear on an instance that already has a vocabulary.
//
// `Recording` covers the phonograph records, flexi-discs and cassettes the batch
// pipeline keeps finding — it has no fields of its own, which is fine: typeFields
// returns an empty list and the record keeps its bibliographic tail. `Music`
// means printed music. `Instrument` is an instrument as an object; `Hardware` is
// studio equipment, and a synthesizer can reasonably be either.
export const TYPE_OPTIONS = [
  'Book',
  'Music',
  'Recording',
  'Art',
  ...ARTWORK_TYPES,
  'Instrument',
  'Hardware',
  'Software',
  'Object',
  'Frame',
];

export function typeFields(itemType: string): FieldDef[] {
  return ITEM_TYPES[itemType]?.fields ?? [];
}

/**
 * The options a type picker should show.
 *
 * `stored` is vocab.types. `current` is the record's own type, unioned in so a
 * record whose type is absent from the vocabulary still shows it selected — a
 * <select> with no matching option renders the first one instead, and the next
 * change would silently retype the record. Browse does the same union when
 * building its per-type filing pickers.
 */
export function typeOptions(stored: string[] | undefined, current?: string): string[] {
  const list = stored?.length ? stored : TYPE_OPTIONS;
  const cur = (current || '').trim();
  return cur && !list.includes(cur) ? [...list, cur] : [...list];
}
