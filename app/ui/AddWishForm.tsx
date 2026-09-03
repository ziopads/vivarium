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
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Appends rather than replaces. iOS opens the camera one shot at a time, so
  // photographing a cover and then a copyright page means two trips through
  // this input; replacing on the second would throw the first away.
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setFiles((prev) => [...prev, ...picked]);
    setPreviews((prev) => [...prev, ...picked.map((f) => URL.createObjectURL(f))]);
    e.target.value = '';
  }

  function removeAt(i: number) {
    URL.revokeObjectURL(previews[i]);
    setFiles((prev) => prev.filter((_, n) => n !== i));
    setPreviews((prev) => prev.filter((_, n) => n !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length && !title.trim()) {
      setMsg('Add a photo or a title.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      // One 'image' entry per photograph, in the order shown. The route reads
      // them with getAll and keys them wishlist/<id>/01.webp upward, so the
      // first is the cover.
      for (const f of files) {
        fd.append('image', await resize(f), 'photo.webp');
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
      <p className="mt-1 text-sm text-muted">
        Snap the cover, and the copyright page if you want the edition pinned down — add as many as you like.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">
            Photos{files.length > 0 && ` · ${files.length}`}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={onFile}
            className="text-sm"
          />
          {files.length > 0 && (
            <span className="text-xs text-muted">Tap again to add another. First photo is the cover.</span>
          )}
        </label>

        {previews.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <li key={src} className="relative">
                <img src={src} alt="" className="h-28 w-auto rounded border border-line" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-1 top-1 rounded bg-ink/70 px-1.5 text-xs leading-5 text-white"
                >
                  ×
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 text-[10px] leading-4 text-white">
                    cover
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

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
