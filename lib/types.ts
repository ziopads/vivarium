export type Item = {
  id: number;
  itemType: string;
  title: string;
  author: string;
  publisher: string;
  placeOfPublication: string;
  year: string;
  edition: string;
  printing: string;
  isbn: string;
  format: string;
  description: string;
  blurb: string;
  discussion?: string;
  signed: boolean;
  inscription: string;
  genres: string[];
  shelf: string;
  images: {
    /** Identity/key. Legacy books: "000042/01-cover", resolved as
     *  items/<src>{-thumb}.webp. */
    src: string;
    label: string;
    /**
     * Pipeline-resolved filenames, relative to `base`. When present the
     * resolver uses them verbatim and constructs nothing — which is how a
     * four-tier jpg catalogue and a two-tier webp library coexist without
     * branching on item type. Absent means legacy behaviour.
     * `zoom` is null when the source was too small to warrant the tier.
     */
    files?: {
      thumb: string;
      web: string;
      zoom?: string | null;
      full?: string;
    };
    /** Public/R2 prefix the `files` paths sit under. Defaults to 'items'. */
    base?: string;
  }[];
  subjects: string[];
  places: string[];
  condition: string;
  conditionNotes?: string;
  location: string;
  owner: string;
  notes: string;
  image: string | null;
  cover?: string;
  copyright?: string;
  section?: string;
  visibility?: string;
  maine?: boolean;
  // Acquisition / provenance. ADMIN-ONLY — never rendered to the public catalogue.
  // Lives in the JSONB attributes tail (no migration needed).
  source?: string;
  pricePaid?: string;
  /** Ids of records absorbed into this one by /admin/duplicates. */
  mergedFrom?: number[];
  /**
   * Set only on the trimmed records /browse sends to the browser, standing in
   * for description + discussion so neither has to cross the wire. Never
   * stored: itemToRow puts unknown keys in `attributes`, so a trimmed record
   * must never reach a write path.
   */
  writeupDone?: boolean;
  // Type-specific fields (e.g. picture frames); stored in the JSONB attributes tail.
  frameOuterW?: string;
  frameOuterH?: string;
  frameSightW?: string;
  frameSightH?: string;
  frameDepth?: string;
  frameRabbetDepth?: string;
  frameMaterial?: string;
};
