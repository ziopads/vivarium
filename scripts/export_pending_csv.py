#!/usr/bin/env python3
"""
export_pending_csv.py  —  Stage 3: build a work-CSV of items needing analysis.

Reads the batch manifest that apply_images.py wrote (vivarium-content/_ingest/pending.json)
and emits vivarium-content/_ingest/pending.csv — one row per new item, with the image
file paths to look at and EMPTY columns for every field to fill.

Only items that still look un-analyzed (empty description) are included, so re-running
after a merge naturally shrinks the list. SAFE: reads only; writes one CSV.

USAGE:  python3 scripts/export_pending_csv.py        (override root with VIV_ROOT)
"""
import os, csv, json

ROOT = os.environ.get("VIV_ROOT", "/Users/bjameshaskins/Desktop/_PROJECTS")
WEB  = f"{ROOT}/vivarium"
DATA = f"{WEB}/data/items.json"
INGEST = f"{ROOT}/vivarium-content/_ingest"
PENDING = f"{INGEST}/pending.json"
CSV_OUT = f"{INGEST}/pending.csv"

# Fillable columns, in the order the analyst sees them. Multi-value fields
# (genres / subjects / places) are filled with ';'-separated values.
FIELDS = [
    "isbn", "itemType", "title", "author", "publisher", "placeOfPublication",
    "year", "edition", "printing", "format", "section", "shelf",
    "genres", "subjects", "places", "condition", "description",
]

def main():
    if not os.path.exists(PENDING):
        print(f"No manifest at {PENDING} — run apply_images.py on a new batch first.")
        return
    manifest = json.load(open(PENDING))
    items = json.load(open(DATA))
    by = {i["id"]: i for i in items}

    rows, skipped = [], 0
    for entry in manifest.get("items", []):
        it = by.get(entry["id"])
        if it is None:
            continue                        # id no longer in items.json
        if (it.get("description") or "").strip():
            skipped += 1                    # already analyzed
            continue
        images = " | ".join(img["path"] for img in entry.get("images", []))
        row = {"id": entry["id"], "id6": entry["id6"], "images": images,
               "status": ""}
        for f in FIELDS:
            row[f] = ""
        rows.append(row)

    os.makedirs(INGEST, exist_ok=True)
    header = ["id", "id6", "images"] + FIELDS + ["status"]
    with open(CSV_OUT, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=header)
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote {len(rows)} item(s) needing analysis -> {CSV_OUT}")
    if skipped:
        print(f"  ({skipped} already analyzed — skipped)")
    print("Fill the columns, set status=ready on each finished row, then run merge_results.py.")

if __name__ == "__main__":
    main()
