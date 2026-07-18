'use client';

import { useState } from 'react';
import { ITEM_TYPES, TYPE_OPTIONS, typeFields } from '@/lib/itemTypes';
import EditableText from './EditableText';

// Item type + its type-specific fields (e.g. frame dimensions). The type saves the
// moment you pick it; each field saves when you leave it. No save-all button, so
// half-entered frame measurements can't evaporate.
export default function TypeFieldsEditor({
  itemId,
  itemType,
  values,
}: {
  itemId: number;
  itemType: string;
  values: Record<string, string>;
}) {
  const [type, setType] = useState(itemType || 'Book');
  const [state, setState] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');

  const defs = typeFields(type);

  async function saveType(next: string) {
    setType(next);
    setState('saving');
    try {
      const res = await fetch(`/api/items/${itemId}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: next }),
      });
      setState(res.ok ? 'ok' : 'err');
      if (res.ok) setTimeout(() => setState('idle'), 1600);
    } catch {
      setState('err');
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted">Type</label>
        <select
          value={type}
          onChange={(e) => saveType(e.target.value)}
          className="rounded border border-line bg-card px-2 py-1 text-sm"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {ITEM_TYPES[type] && <span className="text-xs text-muted">— {ITEM_TYPES[type].label} fields</span>}
        {state === 'saving' && <span className="text-xs text-muted">saving…</span>}
        {state === 'ok' && <span className="text-xs text-moss">✓ saved</span>}
        {state === 'err' && <span className="text-xs text-rust">! not saved</span>}
      </div>

      {defs.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {defs.map((f) => (
            <EditableText
              key={f.key}
              itemId={itemId}
              field={f.key}
              label={f.label}
              initial={values[f.key] ?? ''}
              // Type-specific values ride in the allowlisted `fields` bag.
              buildBody={(v) => ({ fields: { [f.key]: v } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
