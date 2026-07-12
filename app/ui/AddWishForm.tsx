'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Downscale + webp-encode in the browser so bookstore uploads stay small.
async function resize(file: File, maxDim = 1200, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/webp', quality),
  );
}

export default function AddWishForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file && !title.trim()) {
      setMsg('Add a photo or a title.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      if (file) {
        const blob = await resize(file);
        fd.append('image', blob, 'photo.webp');
      }
      fd.append('title', title.trim());
      fd.append('author', author.trim());
      const res = await fetch('/api/wishlist/add', { method: 'POST', body: fd });
      if (res.ok) {
        router.push('/wishlist');
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error || 'Failed to add.');
        setBusy(false);
      }
    } catch {
      setMsg('Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href="/wishlist" className="text-sm text-rust hover:underline">← wishlist</Link>
      <h1 className="mt-3 font-serif text-2xl">Add to wishlist</h1>
      <p className="mt-1 text-sm text-muted">Snap the cover — you can fill in the title and author later.</p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">Photo</span>
          <input type="file" accept="image/*" capture="environment" onChange={onFile} className="text-sm" />
        </label>
        {preview && <img src={preview} alt="" className="max-h-64 w-auto max-w-full rounded border border-line" />}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="rounded-md border border-line bg-card px-3 py-2" />
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" className="rounded-md border border-line bg-card px-3 py-2" />
        <button disabled={busy} className="rounded-md bg-rust px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'Adding…' : 'Add to wishlist'}
        </button>
        {msg && <p className="text-sm text-rust">{msg}</p>}
      </form>
    </div>
  );
}
