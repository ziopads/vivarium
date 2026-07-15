#!/usr/bin/env python3
"""
merge_results.py  —  Stage 5: fold the analyzed CSV back into LOCAL items.json.

Reads vivarium-content/_ingest/pending.csv and updates matching records in
data/items.json BY ID. Touches only the ids in the CSV; every other record passes
through untouched.

SAFETY (learned the hard way):
  * LOCAL ONLY. Never connects to Supabase. Seeding live is a separate, insert-only
    step (seed-new-items.mjs), which aborts on any id collision.
  * FILL, DON'T CLOBBER. A blank CSV cell never erases an existing value; only a
    non-empty cell writes. So re-running is safe and manual edits survive.
  * VALIDATED VOCAB. section / shelf / genres are checked against data/vocab.json;
    anything unknown is reported and SKIPPED (never written as junk), so you can add
    it to the vocab deliberately.
  * BACKUP. data/items.json.mrgbak is written before any change.

Only rows with status == "ready" (case-insensitive) are applied.

USAGE:  python3 scripts/merge_results.py            (override root with VIV_ROOT)
"""
import os, csv, json, shutil

ROOT = os.environ.get("VIV_ROOT", "/Users/bjameshaskins/Desktop/_PROJECTS")
WEB  = f"{ROOT}/vivarium"
DATA = f"{WEB}/data/items.json"
VOCAB = f"{WEB}/data/vocab.json"
CSV_IN = f"{ROOT}/vivarium-content/_ingest/pending.csv"

SCALAR = ["isbn", "itemType", "title", "author", "publisher", "placeOfPublication",
          "year", "edition", "printing", "format", "condition", "description"]
MULTI  = ["subjects", "places"]     # free-text multi-value, ';'-separated

def split_multi(s):
    return [p.strip() for p in s.split(";") if p.strip()]

def main():
    if not os.path.exists(CSV_IN):
        print(f"No {CSV_IN} — run export_pending_csv.py and fill it first.")
        return
    items = json.load(open(DATA))
    by = {i["id"]: i for i in items}
    vocab = json.load(open(VOCAB))
    sections = set(vocab.get("sections", []))
    genres_ok = set(vocab.get("genres", []))
    shelves_by = vocab.get("shelvesBySection", {})

    rows = list(csv.DictReader(open(CSV_IN)))
    updated, warnings = 0, []

    for row in rows:
        if (row.get("status") or "").strip().lower() != "ready":
            continue
        try:
            iid = int(row["id"])
        except (KeyError, ValueError):
            continue
        it = by.get(iid)
        if it is None:
            warnings.append(f"id {row.get('id')}: not in items.json — skipped")
            continue

        # scalars: write only when the cell has a value (never blank an existing one)
        for f in SCALAR:
            v = (row.get(f) or "").strip()
            if v:
                it[f] = v
        for f in MULTI:
            vals = split_multi(row.get(f) or "")
            if vals:
                it[f] = vals

        # section (validated)
        sec = (row.get("section") or "").strip()
        if sec:
            if sec in sections:
                it["section"] = sec
            else:
                warnings.append(f"id {iid}: section '{sec}' not in vocab — skipped")
                sec = it.get("section", "")

        # shelf (validated against the item's section)
        shelf = (row.get("shelf") or "").strip()
        if shelf:
            allowed = set(shelves_by.get(sec or it.get("section", ""), []))
            if shelf in allowed:
                it["shelf"] = shelf
            else:
                warnings.append(
                    f"id {iid}: shelf '{shelf}' not under section "
                    f"'{sec or it.get('section','')}' — skipped")

        # genres (validated)
        gvals = split_multi(row.get("genres") or "")
        if gvals:
            good = [g for g in gvals if g in genres_ok]
            bad = [g for g in gvals if g not in genres_ok]
            if good:
                it["genres"] = good
            for g in bad:
                warnings.append(f"id {iid}: genre '{g}' not in vocab — skipped")

        updated += 1

    if not updated:
        print("No rows with status=ready — nothing merged.")
        if warnings:
            print("\nWarnings:")
            for w in warnings:
                print("  " + w)
        return

    shutil.copy(DATA, DATA + ".mrgbak")
    json.dump(items, open(DATA, "w"), ensure_ascii=False, indent=1)
    print(f"Merged {updated} record(s) into items.json (backup: items.json.mrgbak).")
    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print("  " + w)
        print("\nAdd any intended new section/shelf/genre to data/vocab.json, then re-run.")
    print("\nNext: seed-new-items.mjs (insert-only) to push just these ids to Supabase.")

if __name__ == "__main__":
    main()
