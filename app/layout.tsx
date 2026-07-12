import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import AuthNav from './ui/AuthNav';
import WishlistLink from './ui/WishlistLink';

export const metadata: Metadata = {
  metadataBase: new URL('https://vivarium.gaffcutter.com'),
  title: 'Vivarium',
  description: 'A living catalogue of a personal library — books, art, and instruments.',
  openGraph: {
    title: 'Vivarium',
    description: 'A living catalogue of a personal library — books, art, and instruments.',
    siteName: 'Vivarium',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vivarium',
    description: 'A living catalogue of a personal library — books, art, and instruments.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6 sm:py-5">
            <Link href="/" className="font-serif text-2xl tracking-tight">
              Vivarium
            </Link>
            <nav className="flex items-baseline gap-5 text-sm">
              <Link href="/" className="text-muted hover:text-rust">
                Catalog
              </Link>
              <WishlistLink />
              <AuthNav />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted sm:px-6 sm:py-10">
          Vivarium — kept, not discarded.
        </footer>
      </body>
    </html>
  );
}
