import { redirect } from 'next/navigation';
import { instance } from '@/lib/instance';
import CatalogHome from './ui/CatalogHome';

export const dynamic = 'force-dynamic';

// Studio instances open on their sessions; the gear catalogue lives at /gear.
// Everywhere else the catalogue is the home page.
export default async function Home() {
  if (instance.studio) redirect('/studio');
  return <CatalogHome />;
}
