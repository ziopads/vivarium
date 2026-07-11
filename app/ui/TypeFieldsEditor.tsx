'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ITEM_TYPES, TYPE_OPTIONS, typeFields } from '@/lib/itemTypes';

export default function TypeFieldsEditor({
  itemId,
  itemType,
  values,
}: {
  itemId: number;
  itemType: string;
  values: Record<string, string>;
}) {
  const router = useRouter();
  const [type, setType] = useState(itemType || 'Book');
  const [fields, setFields] = useState<Record<string, string>>(values);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const defs = typeFields(type);

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/items/${itemId}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: type, fields }),
      });
      if (res.ok) {
        setMsg('Saved');
        router.refresh();
      } else {
        setMsg('Not saved');
      }
    } catch {
      setMsg('Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted">Type</label>
        <input
          list="typeopts"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-line bg-card px-2 py-1 text-sm"
        />
        <datalist id="typeopts">{TYPE_OPTIONS.map((t) => <option key={t} value={t} />)}</datalist>
        {ITEM_TYPES[type] && (
          <span className="text-xs text-muted">— {ITEM_TYPES[type].label} fields</span>
        )}
      </div>

      {defs.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {defs.map((f) => (
            <label key={f.key} className="text-sm">
              <span className="mb-1 block text-muted">{f.label}</span>
              <input
                value={fields[f.key] ?? ''}
                onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                className="w-full rounded border border-line bg-card px-2 py-1 outline-none focus:border-rust"
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-md bg-rust px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save type & fields'}
        </button>
        {msg && <span className="text-sm text-moss">{msg}</span>}
      </div>
    </div>
  );
}
