'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Puts the record into an explicit editable state. Nothing is editable by default:
// the page shows a single "Edit record" action. Inside, every field saves as you
// leave it, and "Save & close" is the highlighted next action — it flushes the field
// you're still in, then refreshes the read-only view once.
export default function EditMode({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  if (!open) {
    return (
      <div className="mt-6">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-rust hover:border-rust"
        >
          ✎ Edit record
        </button>
      </div>
    );
  }

  async function saveAndClose() {
    setClosing(true);
    // Blur whatever field is focused so its on-exit save fires, then let it land.
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise((r) => setTimeout(r, 300));
    setOpen(false);
    setClosing(false);
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-lg border border-rust/40 bg-card/40 p-1">
      {children}
      <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-3 rounded-b-lg bg-card/95 px-4 py-3">
        <button
          onClick={saveAndClose}
          disabled={closing}
          className="rounded-md bg-rust px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {closing ? 'Saving…' : 'Save & close'}
        </button>
        <span className="text-xs text-muted">
          Each field saves when you leave it — your work isn’t lost if you navigate away.
        </span>
      </div>
    </div>
  );
}
