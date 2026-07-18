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
  images: { src: string; label: string }[];
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
  // Type-specific fields (e.g. picture frames); stored in the JSONB attributes tail.
  frameOuterW?: string;
  frameOuterH?: string;
  frameSightW?: string;
  frameSightH?: string;
  frameDepth?: string;
  frameRabbetDepth?: string;
  frameMaterial?: string;
};
