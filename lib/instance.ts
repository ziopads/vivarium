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
  theme: 'library' | 'tamplin' | 'sirsinate';
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
  /**
   * Copy for the shared-password prompt. Only rendered when the gate is on
   * (PUBLIC_GATE_ENABLED=1), and worth setting per instance because the reason
   * a site is gated differs: an invitation-only catalogue is addressing someone
   * who was sent a link, a private working inventory is addressing its owner.
   * Omitted falls back to the neutral wording in app/gate/page.tsx.
   */
  gate?: {
    title: string;
    intro: string;
    /** Small print under the form. Omit for none. */
    help?: string;
  };
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
  gate: {
    title: 'Selected Works',
    intro: 'This catalogue is shared privately. Please enter the password you were given.',
    help: 'An access issue? Reply to the message that brought you here.',
  },
  metadata: {
    title: 'Valerie Tamplin — Catalogue Raisonné',
    titleTemplate: '%s — Valerie Tamplin',
    description: 'The catalogue raisonné of painter Valerie Tamplin.',
    siteName: 'Valerie Tamplin',
    metadataBase: 'https://catalog.valerietamplin.com',
  },
};

const sirsinate: InstanceConfig = {
  theme: 'sirsinate',
  wordmark: 'Sirsinate',
  // The wordmark and nav point back to sirsinate.com, so the catalogue reads as
  // one more part of the studio site rather than a separate application. That
  // site is a single-page scroller, so every nav target is an anchor on it.
  homeUrl: 'https://sirsinate.com',
  nav: [
    { label: 'Depths', href: 'https://sirsinate.com/#depths' },
    { label: 'Voices', href: 'https://sirsinate.com/#voices' },
    { label: 'Current', href: 'https://sirsinate.com/#current' },
    { label: 'Contact', href: 'https://sirsinate.com/#contact' },
  ],
  // Unlike the Tamplin catalogue, this instance is a working tool rather than
  // something shown to visitors, and the wishlist is the gear-to-find list. So
  // the app's own nav stays on alongside the site chrome.
  showAppNav: true,
  footer: '© {year} Gaff Cutter LLC. All rights reserved.',
  gate: {
    title: 'Studio Catalogue',
    intro: 'A private record of the studio — instruments, software and reference.',
  },
  metadata: {
    title: 'Sirsinate — Studio Catalogue',
    titleTemplate: '%s — Sirsinate',
    description: 'Hardware, software and reference for Sirsinate Sound Laboratory.',
    siteName: 'Sirsinate Sound Laboratory',
    metadataBase: 'https://studio.sirsinate.com',
  },
};

const instances: Record<string, InstanceConfig> = { library, tamplin, sirsinate };

export const instance: InstanceConfig =
  instances[process.env.NEXT_PUBLIC_INSTANCE ?? 'library'] ?? library;
