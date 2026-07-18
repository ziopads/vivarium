'use client';

import { useState } from 'react';

// A single field that PERSISTS ON BLUR — you can never lose work by clicking away.
// Deliberately does NOT call router.refresh() on save: refreshing mid-edit re-renders
// the tree and wipes unsaved sibling fields (that was the old bug). The surrounding
// EditMode refreshes once, when you close it.
export default function EditableText({
  itemId,
  field,
  label,
  initial,
  buildBody,
  textarea = false,
  rows = 2,
  placeholder,
  list,
}: {
  itemId: number;
  field: string;
  label: string;
  initial: string;
  /** Body to POST. Defaults to a top-level field: { [field]: value } */
  buildBody?: (v: string) => Record<string, unknown>;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
  list?: string;
}) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

  async function commit() {
    const val = v.trim();
    if (val === saved.trim()) return; // nothing changed — don't churn the DB
    setState('saving');
    try {
      const body = buildBody ? buildBody(val) : { [field]: val };
      const res = await fetch(`/api/items/${itemId}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaved(val);
        setState('ok');
        setTimeout(() => setState('idle'), 1600);
      } else {
        setState('err');
      }
    } catch {
      setState('err');
    }
  }

  const cls =
    'w-full rounded border border-line bg-card px-2 py-1 outline-none focus:border-rust';

  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center gap-2">
        <span className="text-muted">{label}</span>
        {state === 'saving' && <span className="text-xs text-muted">saving…</span>}
        {state === 'ok' && <span className="text-xs text-moss">✓ saved</span>}
        {state === 'err' && <span className="text-xs text-rust">! not saved</span>}
      </span>
      {textarea ? (
        <textarea
          value={v}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          className={cls}
        />
      ) : (
        <input
          value={v}
          list={list}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          className={cls}
        />
      )}
    </label>
  );
}
