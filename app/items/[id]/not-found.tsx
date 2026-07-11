import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-2xl">Not in the catalog</h1>
      <p className="mt-2 text-muted">That item id doesn&apos;t exist (yet).</p>
      <Link href="/" className="mt-4 inline-block text-rust hover:underline">
        ← back to catalog
      </Link>
    </div>
  );
}
