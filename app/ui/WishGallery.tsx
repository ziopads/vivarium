'use client';

import { useState } from 'react';

export type WishShot = { full: string; thumb: string; label: string };

/**
 * One main image with thumbnails beneath, matching the item page.
 *
 * Deliberately not app/ui/Gallery: that one is tied to items — it posts to
 * /api/items/:id/cover, /images and /copyright, and takes tiered ItemImage
 * objects. A wish has neither those routes nor those tiers. Its photographs
 * arrive either as plain R2 keys (added from a phone) or as a catalogue
 * record's gallery carried across when the book left the library, and both are
 * resolved to URLs on the server before they reach here.
 */
export default function WishGallery({ photos, title }: { photos: WishShot[]; title: string }) {
  const [active, setActive] = useState(0);
  if (!photos.length) return null;

  const current = photos[Math.min(active, photos.length - 1)];

  return (
    <div className="shrink-0">
      <figure>
        <a href={current.full} target="_blank" rel="noreferrer" title="Open full size">
          <img
            src={current.full}
            alt={`${title} — ${current.label}`}
            className="max-h-[28rem] w-auto max-w-full rounded border border-line shadow-sm"
          />
        </a>
        {photos.length > 1 && (
          <figcaption className="mt-2 text-xs text-muted">{current.label}</figcaption>
        )}
      </figure>

      {photos.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <li key={p.full}>
              <button
                onClick={() => setActive(i)}
                title={p.label}
                aria-label={p.label}
                aria-current={i === active}
                className={`block overflow-hidden rounded border transition ${
                  i === active ? 'border-rust ring-1 ring-rust' : 'border-line hover:border-rust'
                }`}
              >
                <img
                  src={p.thumb}
                  alt={p.label}
                  loading="lazy"
                  className="h-20 w-16 bg-parchment object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
