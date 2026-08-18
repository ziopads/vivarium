// Per-instance identity + theme.
//
// One env var — NEXT_PUBLIC_INSTANCE — selects the active config at build time;
// everything downstream follows from it: the header wordmark and nav, the
// footer, the page metadata, and the `data-theme` attribute that drives the
// palette/font tokens in globals.css. This is the same "name the instance, the
// rest follows" pattern the project uses for data (LOCAL_DATA_FILE) and images
// (NEXT_PUBLIC_LOCAL_IMAGE_DIR), extended to how the site looks and labels
// itself — so a second instance is config, not a fork.
//
// NEXT_PUBLIC_INSTANCE is inlined at BUILD time (like every NEXT_PUBLIC_ var),
// so it must be set on the relevant Vercel project and a redeploy is required to
// change it. Unset => 'library' (the Vivarium / gaffcutter look is the default,
// so the library build needs no new env at all).

export type NavItem = { label: string; href: string };

export type InstanceConfig = {
  /** Selects the palette/font block in globals.css ([data-theme="…"]). */
  theme: 'library' | 'tamplin';
  /** Wordmark text and where it links (the "home" of this identity). */
  wordmark: string;
  homeUrl: string;
  /** Top-nav links. hrefs may be absolute (off-site) or app-relative. */
  nav: NavItem[];
  /** Whether to show the app's own nav (wishlist + auth). Off for the public
   *  catalogue, which mirrors the marketing site's chrome instead. */
  showAppNav: boolean;
  /** Footer line. `{year}` is substituted at render time. */
  footer: string;
  metadata: {
    title: string;
    /** Optional `%s`-style template for child page titles. */
    titleTemplate?: string;
    description: string;
    siteName: string;
    metadataBase: string;
  };
};

const library: InstanceConfig = {
  theme: 'library',
  wordmark: 'Vivarium',
  homeUrl: '/',
  nav: [{ label: 'Catalog', href: '/' }],
  showAppNav: true,
  footer: 'Vivarium — kept, not discarded.',
  metadata: {
    title: 'Vivarium',
    description: 'A living catalogue of a personal library — books, art, and instruments.',
    siteName: 'Vivarium',
    metadataBase: 'https://vivarium.gaffcutter.com',
  },
};

const tamplin: InstanceConfig = {
  theme: 'tamplin',
  wordmark: 'Valerie Tamplin',
  // The wordmark and nav point back to the live marketing site, so the catalogue
  // reads as one more section of valerietamplin.com rather than a separate app.
  homeUrl: 'https://valerietamplin.com',
  nav: [
    { label: 'Works', href: 'https://valerietamplin.com/works' },
    { label: 'About', href: 'https://valerietamplin.com/about' },
    { label: 'Contact', href: 'https://valerietamplin.com/contact' },
  ],
  // The catalogue is invitation-only, reached by direct link — it is deliberately
  // NOT advertised as a nav item, and it does not surface the library's
  // wishlist/auth nav. Admins reach /login directly (it is gate-exempt).
  showAppNav: false,
  footer: '© {year} Valerie Tamplin. All rights reserved.',
  metadata: {
    title: 'Valerie Tamplin — Catalogue Raisonné',
    titleTemplate: '%s — Valerie Tamplin',
    description: 'The catalogue raisonné of painter Valerie Tamplin.',
    siteName: 'Valerie Tamplin',
    metadataBase: 'https://catalog.valerietamplin.com',
  },
};

const instances: Record<string, InstanceConfig> = { library, tamplin };

export const instance: InstanceConfig =
  instances[process.env.NEXT_PUBLIC_INSTANCE ?? 'library'] ?? library;
