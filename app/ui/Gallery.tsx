'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { imgUrl } from '@/lib/img';

type Shot = { src: string; label: string };

export default function Gallery({
  images,
  title,
  itemId,
  copyrightSrc,
  editable = false,
}: {
  images: Shot[];
  title: string;
  itemId: number;
  copyrightSrc?: string;
  editable?: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  if (!images || images.length === 0) return null;
  const current = images[Math.min(active, images.length - 1)];
  const isPrimary = active === 0;

  async function setAsCover() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/items/${itemId}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: current.src }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Failed' }));
        setMsg(error || 'Could not set cover');
      } else {
        setMsg('Cover updated');
        setActive(0);
        router.refresh();
      }
    } catch {
      setMsg('Could not reach the server');
    } finally {
      setSaving(false);
    }
  }

  async function setAsCopyright() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/items/${itemId}/copyright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: current.src }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Failed' }));
        setMsg(error || 'Could not set copyright page');
      } else {
        setMsg(current.src === copyrightSrc ? 'Copyright page cleared' : 'Copyright page set');
        router.refresh();
      }
    } catch {
      setMsg('Could not reach the server');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6">
      <figure>
        <img
          src={imgUrl(current.src)}
          alt={`${title} — ${current.label}`}
          className="max-h-[30rem] w-auto rounded shadow-sm"
        />
        <figcaption className="mt-2 flex items-center gap-3 text-xs text-muted">
          <span>{current.label}</span>
          {isPrimary && (
            <span className="rounded-full bg-rust/10 px-2 py-0.5 text-rust">main image</span>
          )}
          {editable && !isPrimary && (
            <button
              onClick={setAsCover}
              disabled={saving}
              className="rounded-full border border-line px-2 py-0.5 hover:border-rust hover:text-rust disabled:opacity-50"
            >
              {saving ? 'Setting…' : 'Set as main image'}
            </button>
          )}
          {editable && (
            <button
              onClick={setAsCopyright}
              disabled={saving}
              className={`rounded-full border px-2 py-0.5 disabled:opacity-50 ${
                current.src === copyrightSrc
                  ? 'border-moss bg-moss/10 text-moss'
                  : 'border-line hover:border-rust hover:text-rust'
              }`}
            >
              {current.src === copyrightSrc ? '✓ copyright page' : 'Set as copyright page'}
            </button>
          )}
          {msg && <span className="text-moss">{msg}</span>}
        </figcaption>
      </figure>

      {images.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {images.map((s, i) => (
            <li key={s.src}>
              <button
                onClick={() => {
                  setActive(i);
                  setMsg('');
                }}
                title={s.label}
                aria-label={s.label}
                aria-current={i === active}
                className={`relative block overflow-hidden rounded border transition ${
                  i === active ? 'border-rust ring-1 ring-rust' : 'border-line hover:border-rust'
                }`}
              >
                <img
                  src={imgUrl(s.src, true)}
                  alt={s.label}
                  loading="lazy"
                  className="h-20 w-16 bg-parchment object-cover"
                />
                {i === 0 && (
                  <span className="absolute inset-x-0 bottom-0 bg-rust/80 text-center text-[9px] leading-tight text-white">
                    main
                  </span>
                )}
                {s.src === copyrightSrc && (
                  <span className="absolute right-0 top-0 bg-moss/80 px-1 text-[9px] leading-tight text-white">©</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
