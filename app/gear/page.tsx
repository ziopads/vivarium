import { notFound } from 'next/navigation';
import { instance } from '@/lib/instance';
import CatalogHome from '../ui/CatalogHome';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gear' };

// The gear catalogue's front page on studio instances (see app/page.tsx).
export default async function GearHome() {
  if (!instance.studio) notFound();
  return <CatalogHome />;
}
