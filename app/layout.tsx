import type { Metadata } from 'next';
import Link from 'next/link';
import { Instrument_Sans } from 'next/font/google';
import './globals.css';
import AuthNav from './ui/AuthNav';
import WishlistLink from './ui/WishlistLink';
import { instance } from '@/lib/instance';

// Loaded for every build, but only referenced by the tamplin theme's tokens, so
// the library never actually downloads it (fonts fetch only when matched).
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL(instance.metadata.metadataBase),
  title: instance.metadata.titleTemplate
    ? { default: instance.metadata.title, template: instance.metadata.titleTemplate }
    : instance.metadata.title,
  description: instance.metadata.description,
  openGraph: {
    title: instance.metadata.title,
    description: instance.metadata.description,
    siteName: instance.metadata.siteName,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: instance.metadata.title,
    description: instance.metadata.description,
  },
};

/** Off-site (absolute) hrefs get a plain <a>; in-app hrefs stay client-routed. */
function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return /^https?:\/\//.test(href) ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isTamplin = instance.theme === 'tamplin';
  const footer = instance.footer.replace('{year}', String(new Date().getFullYear()));

  return (
    <html
      lang="en"
      data-theme={isTamplin ? 'tamplin' : undefined}
      className={isTamplin ? instrumentSans.variable : undefined}
    >
      <body>
        {isTamplin ? (
          /* Gallery chrome — mirrors valerietamplin.com: fixed white header, a
             tracked medium wordmark, tracked 13px nav that goes grey -> ink. */
          <header className="fixed inset-x-0 top-0 z-50 bg-parchment">
            <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-6 py-6 sm:px-[60px] sm:py-8">
              <NavLink
                href={instance.homeUrl}
                className="text-[15px] font-medium tracking-[0.02em] text-ink sm:text-[16px]"
              >
                {instance.wordmark}
              </NavLink>
              <nav className="flex items-center gap-6 sm:gap-8">
                {instance.nav.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    className="text-[13px] tracking-[0.04em] text-muted transition-colors hover:text-ink"
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </header>
        ) : (
          /* Library chrome — unchanged from the original layout. */
          <header className="border-b border-line">
            <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6 sm:py-5">
              <Link href={instance.homeUrl} className="font-serif text-2xl tracking-tight">
                {instance.wordmark}
              </Link>
              <nav className="flex items-baseline gap-5 text-sm">
                {instance.nav.map((item) => (
                  <NavLink key={item.href} href={item.href} className="text-muted hover:text-rust">
                    {item.label}
                  </NavLink>
                ))}
                {instance.showAppNav && (
                  <>
                    <WishlistLink />
                    <AuthNav />
                  </>
                )}
              </nav>
            </div>
          </header>
        )}

        <main
          className={
            isTamplin
              ? 'mx-auto w-full max-w-[1600px] px-6 pb-16 pt-24 sm:px-[60px] sm:pt-28'
              : 'mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8'
          }
        >
          {children}
        </main>

        <footer
          className={
            isTamplin
              ? 'mx-auto w-full max-w-[1600px] px-6 py-8 text-[11px] tracking-[0.02em] text-muted sm:px-[60px] sm:py-10'
              : 'mx-auto max-w-6xl px-4 py-8 text-sm text-muted sm:px-6 sm:py-10'
          }
        >
          {footer}
        </footer>
      </body>
    </html>
  );
}
