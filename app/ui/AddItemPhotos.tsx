'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Downscale + webp-encode in the browser (full + thumbnail) so uploads stay small
// and match the item image convention (each shot has a matching -thumb).
async function resize(file: File, maxDim: number, quality: number): Promise<Blob> {
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

export default function AddItemPhotos({ itemId }: { itemId: number }) {
  const router = useRouter();
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
        const full = await resize(files[i], 1400, 0.82);
        const thumb = await resize(files[i], 420, 0.8);
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
    } catch {
      setMsg('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-line bg-card p-4">
      <p className="mb-2 text-sm font-medium">Add photos</p>
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
