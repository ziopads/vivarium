export type FieldDef = { key: string; label: string };
export type TypeDef = { label: string; fields: FieldDef[] };

// Per-type field definitions. Type-specific values are stored as flat
// properties on the item and land in the DB `attributes` bag automatically.
// Add a type here to make its fields appear in the editor and on the detail page.
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
};

// Suggestions for the type picker; free text is still allowed.
export const TYPE_OPTIONS = ['Book', 'Music', 'Art', 'Instrument', 'Object', 'Frame'];

export function typeFields(itemType: string): FieldDef[] {
  return ITEM_TYPES[itemType]?.fields ?? [];
}
