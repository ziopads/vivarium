'use client';

import { useState } from 'react';
import type { PathOption } from '@/lib/taxonomy';

/**
 * The filing picker: one control naming a whole position in the classification
 * tree.
 *
 * One control where there were two. Section and shelf were separate because they
 * were separate fields, and keeping them in step took real work: the shelf list
 * had to be recomputed from the chosen section, a shelf already set had to be
 * checked against a new section and silently dropped when it no longer fitted,
 * and a bulk change needed the shelves common to every selected item. A path is
 * one value, so all of that goes.
 *
 * Depth is shown by indentation. Figure spaces rather than CSS because this is
 * an <option>, which browsers will not let us style.
 *
 * `paths` should be scoped to the item's type — see pathOptionsForType. A
 * caller with no item in hand (a filter, a bulk bar over a mixed selection)
 * passes the whole tree's options instead.
 */
export default function PathSelect({
  value,
  paths,
  onChange,
  className,
  extra,
  disabled = false,
  lazy = false,
  unfiledLabel = '— unfiled —',
}: {
  value: string;
  paths: PathOption[];
  onChange: (v: string) => void;
  className?: string;
  /** Leading options the caller adds — sentinels for a bulk bar or a filter. */
  extra?: { value: string; label: string }[];
  disabled?: boolean;
  /**
   * Defer building the option list until the control is reached for.
   *
   * The list view renders one of these per row. With seventeen hundred rows and
   * a hundred-odd paths that is a hundred and seventy thousand <option> nodes in
   * the document, every one of them walked on every re-render — which is most of
   * why typing in the search box used to feel like a freeze. Closed, this renders
   * the current value alone, which is all a closed <select> ever displays; the
   * rest fills in on hover or focus, before any click can open the popup.
   */
  lazy?: boolean;
  /** Label for the empty value. */
  unfiledLabel?: string;
}) {
  const [open, setOpen] = useState(!lazy);

  const list = open ? paths : paths.filter((p) => p.path === value);
  // A path stored on a record but missing from the options still has to be
  // selectable, or opening the row would silently reassign it to whatever the
  // browser picks first. Sentinel values live in `extra` and are not paths, so
  // they are not treated as unknown ones.
  const inExtra = extra?.some((o) => o.value === value) ?? false;
  const unknown = !inExtra && !!value && !paths.some((p) => p.path === value);

  return (
    <select
      value={value}
      disabled={disabled}
      className={className}
      onPointerEnter={lazy ? () => setOpen(true) : undefined}
      onPointerDown={lazy ? () => setOpen(true) : undefined}
      onFocus={lazy ? () => setOpen(true) : undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      {extra?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      <option value="">{unfiledLabel}</option>
      {unknown && <option value={value}>{value} (not in the classification)</option>}
      {list.map((p) => (
        <option key={p.path} value={p.path}>
          {'\u2007\u2007'.repeat(p.depth)}
          {p.name}
        </option>
      ))}
    </select>
  );
}
