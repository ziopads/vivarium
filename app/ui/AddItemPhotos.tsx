'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Decode a picked file to a bitmap. Most formats (JPEG/PNG, and HEIC on Apple
// devices) go straight through createImageBitmap. Desktop Chrome/Firefox can't
// decode HEIC, so on failure we convert it to JPEG client-side via heic2any
// (lazily imported — the ~1MB decoder only loads when a HEIC actually needs it).
async function fileToBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    try {
      const heic2any = (await import('heic2any')).default as (o: {
        blob: Blob;
        toType?: string;
        quality?: number;
      }) => Promise<Blob | Blob[]>;
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      return await createImageBitmap(Array.isArray(out) ? out[0] : out);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Couldn’t read “${file.name || 'image'}” (${file.type || 'unknown type'}). ` +
          `If it’s a HEIC, try a JPEG or upload from Safari. [${why}]`,
      );
    }
  }
}

// Downscale + webp-encode a bitmap (full + thumbnail) so uploads stay small and
// match the item image convention (each shot has a matching -thumb).
async function encode(bmp: ImageBitmap, maxDim: number, quality: number): Promise<Blob> {
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

export default function AddItemPhotos({ itemId }: { itemId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files || []));
    setMsg('');
  }

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        const bmp = await fileToBitmap(files[i]);   // decode once (HEIC-aware)
        const full = await encode(bmp, 1400, 0.82);
        const thumb = await encode(bmp, 420, 0.8);
        fd.append('full', full, `${i}.webp`);
        fd.append('thumb', thumb, `${i}-thumb.webp`);
      }
      const res = await fetch(`/api/items/${itemId}/images`, { method: 'POST', body: fd });
      if (res.ok) {
        setFiles([]);
        setMsg('Added.');
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error || 'Upload failed.');
      }
    } catch (err) {
      console.error('item photo upload failed:', err);
      setMsg(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-6">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-rust hover:border-rust"
        >
          + Add photos
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-line bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Add photos</p>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-rust">
          close
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">
        Snap or choose one or more shots (cover, copyright page, etc.). After they land,
        use a thumbnail’s “Set as main / copyright” to label them.
      </p>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={onPick}
        className="text-sm"
      />
      {files.length > 0 && (
        <p className="mt-2 text-xs text-muted">{files.length} photo(s) ready</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={upload}
          disabled={busy || !files.length}
          className="rounded-md bg-rust px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Upload'}
        </button>
        {msg && <span className="text-sm text-moss">{msg}</span>}
      </div>
    </div>
  );
}
