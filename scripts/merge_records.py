#!/usr/bin/env python3
"""Inject enriched records (vivarium-content/records_master.json) into apply-created skeletons.
Usage:
  python3 scripts/apply_images.py | tee /tmp/apply.log
  python3 scripts/merge_records.py --apply-log /tmp/apply.log            # dry run
  python3 scripts/merge_records.py --apply-log /tmp/apply.log --write    # patch items.json (.mergebak backup)
Matches on the intake FOLDER name (from apply's output), sets every field except description/
discussion (write-up task owns those), and tags image 2 as the copyright page.
"""
import os, re, json, sys, shutil
ROOT   = os.environ.get("VIV_ROOT", "/Users/bjameshaskins/Desktop/_PROJECTS")
READY  = f"{ROOT}/vivarium-content/image-ready"
DATA   = f"{ROOT}/vivarium/data/items.json"
MASTER = f"{ROOT}/vivarium-content/records_master.json"
master = json.load(open(MASTER))
PUSH = ["itemType","publisher","placeOfPublication","year","edition","printing","isbn","isbn_status",
        "format","signed","inscription","section","shelf","genres","subjects","places","condition",
        "location","owner","notes"]
# pilot folders whose copyright page isn't image 2 (they predate the 1/2 convention): folder-prefix -> src number
COPYRIGHT_HINT = {"001-":"0525", "003-":"0448"}
def cover_stems(d):
    if not os.path.isdir(d): return []
    return sorted(f[:-5] for f in os.listdir(d) if f.endswith(".webp") and not f.endswith("-thumb.webp"))
def merge_one(rec, name):
    m = master.get(name)
    if not m: return False
    for k in PUSH: rec[k] = m[k]
    id6 = f"{rec['id']:06d}"; stems = cover_stems(f"{READY}/{name}")
    hint = next((v for p,v in COPYRIGHT_HINT.items() if name.startswith(p)), None)
    cp = None
    if hint: cp = next((s for s in stems if hint in s), None)
    if not cp: cp = next((s for s in stems if s.startswith("02-")), None)
    if cp: rec["copyright"] = f"{id6}/{cp}"
    return True
def main():
    if "--apply-log" not in sys.argv: sys.exit(__doc__)
    log = sys.argv[sys.argv.index("--apply-log")+1]; write = "--write" in sys.argv
    mp = {}
    for line in open(log):
        m = re.search(r"^\s*(.+?): created NEW item #(\d+)", line)
        if m: mp[m.group(1)] = int(m.group(2))
    if not mp: sys.exit("No 'created NEW item' lines in apply log.")
    items = json.load(open(DATA)); by = {i["id"]: i for i in items}
    patched = 0; miss = []
    for name, iid in mp.items():
        if iid in by and merge_one(by[iid], name): patched += 1
        elif name not in master: miss.append(name)
    print(f"apply-log folders: {len(mp)} | patched: {patched} | no master row: {miss}")
    if write:
        shutil.copy(DATA, DATA+".mergebak"); json.dump(items, open(DATA,"w"), ensure_ascii=False, indent=1)
        print(f"WROTE {DATA} (backup items.json.mergebak)")
    else:
        print("dry run — add --write to persist.")
if __name__ == "__main__": main()
