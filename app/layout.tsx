import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vivarium',
  description: 'A living catalog of a personal library — books, art, and instruments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-6xl items-baseline justify-between px-6 py-5">
            <Link href="/" className="font-serif text-2xl tracking-tight">
              Vivarium
            </Link>
            <nav className="flex items-baseline gap-5 text-sm">
              <Link href="/" className="text-muted hover:text-rust">
                Catalog
              </Link>
              <Link href="/wishlist" className="text-muted hover:text-rust">
                Wishlist
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted">
          Vivarium — kept, not discarded.
        </footer>
      </body>
    </html>
  );
}
