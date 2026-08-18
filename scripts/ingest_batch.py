#!/usr/bin/env python3
"""
ingest_batch.py — front-half driver for a Vivarium book batch.

The reading/understanding of each book (title + copyright pages) is done by a Claude
enrichment pass, which emits a records file. THIS script does the mechanical rest:
validate taxonomy -> stage into image-intake/ (with title.txt) -> resize/convert (prep)
-> emit records_master.json keyed by intake-folder name (for merge_records.py).

INPUT records JSON  (keyed by SOURCE-relative folder, in the desired catalogue order):
  {
    "jpg02/New Folder With Items 4": {
      "itemType":"Book","title":"...","author":"...","publisher":"...","placeOfPublication":"...",
      "year":"...","edition":"...","printing":"...","isbn":"...","isbn_status":"present|none|unverified|illegible",
      "format":"...","signed":false,"inscription":"","section":"...","shelf":"...","genres":[...],
      "subjects":[...],"places":[...],"condition":"","location":"Maine","owner":"Valerie","notes":"..."
    }, ...
  }

USAGE:
  python3 scripts/ingest_batch.py --source "vivarium-content/2026 0712" --records path/to/records_source.json
  (add --no-prep to skip resize/convert; override root with VIV_ROOT)
"""
import os, re, sys, json, shutil, subprocess, argparse
ROOT   = os.environ.get("VIV_ROOT", "/Users/bjameshaskins/Desktop/_PROJECTS")
INTAKE = f"{ROOT}/vivarium-content/image-intake"
READY  = f"{ROOT}/vivarium-content/image-ready"
MASTER_OUT = f"{ROOT}/vivarium-content/records_master.json"
VOCAB  = json.load(open(f"{ROOT}/vivarium/data/vocab.json"))
EXTS   = (".jpeg",".jpg",".png",".heic",".heif",".tif",".tiff",".webp",".bmp")
def slug(t):
    s = re.sub(r"[^a-z0-9]+","-",(t or "").lower()).strip("-"); return s[:40] or "book"
def validate(records):
    S=set(VOCAB["sections"]); G=set(VOCAB["genres"]); SB=VOCAB["shelvesBySection"]; errs=[]
    for k,m in records.items():
        se,sh = m.get("section",""), m.get("shelf","")
        if se and se not in S: errs.append(f"{k}: bad section {se!r}")
        elif sh and sh not in SB.get(se,[]): errs.append(f"{k}: shelf {sh!r} not under section {se!r}")
        for g in m.get("genres",[]):
            if g not in G: errs.append(f"{k}: bad genre {g!r}")
    return errs
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--source",required=True); ap.add_argument("--records",required=True)
    ap.add_argument("--no-prep",action="store_true")
    ap.add_argument("--reset-intake",action="store_true",
                    help="delete image-intake/ and image-ready/ before staging")
    a=ap.parse_args()
    src=a.source if os.path.isabs(a.source) else f"{ROOT}/{a.source}"
    recs=json.load(open(a.records if os.path.isabs(a.records) else f"{ROOT}/{a.records}"))
    errs=validate(recs)
    if errs:
        print(f"VOCAB VALIDATION FAILED ({len(errs)}):"); [print("  ",e) for e in errs]; sys.exit(1)
    print(f"vocab OK for {len(recs)} records")
    # image-intake/ and image-ready/ are scratch: prep_images.py converts EVERY folder in
    # intake, and apply_images.py creates a NEW record for every non-numeric folder in
    # ready. Leftovers from an earlier batch therefore come through again as duplicates.
    # Refuse rather than delete silently — a numeric folder here may be a deliberate
    # attach-to-existing-item job someone staged by hand.
    leftovers = []
    for d in (INTAKE, READY):
        if os.path.isdir(d):
            leftovers += [f"{os.path.basename(d)}/{x}" for x in sorted(os.listdir(d))
                          if not x.startswith(".")]
    if leftovers and not a.reset_intake:
        print(f"REFUSING TO STAGE — {len(leftovers)} leftover folder(s) from an earlier run:")
        for x in leftovers[:8]: print("  ", x)
        if len(leftovers) > 8: print(f"   ... and {len(leftovers)-8} more")
        print("\nThese would be re-converted and applied as DUPLICATE records.")
        print("Confirm they already reached Supabase, then re-run with --reset-intake.")
        sys.exit(1)
    if a.reset_intake:
        for d in (INTAKE, READY):
            shutil.rmtree(d, ignore_errors=True)
        print("cleared image-intake/ and image-ready/")
    os.makedirs(INTAKE, exist_ok=True)
    master={}; staged=imgs=0
    for i,(rel,m) in enumerate(recs.items(),1):           # insertion order = catalogue order = id order
        sd=os.path.join(src,rel)
        if not os.path.isdir(sd): print(f"  ! missing source folder: {rel}"); continue
        name=f"{i:03d}-{slug(m.get('title',''))}"
        dd=os.path.join(INTAKE,name); os.makedirs(dd,exist_ok=True)
        for f in sorted(x for x in os.listdir(sd) if x.lower().endswith(EXTS) and not x.startswith(".")):
            shutil.copy(os.path.join(sd,f),os.path.join(dd,f)); imgs+=1
        # carry the rotation sidecar (vivarium-batch-processor) through to prep_images.py;
        # it is not an image extension, so it would otherwise be silently dropped here
        rp=os.path.join(sd,"rotate.json")
        if os.path.exists(rp): shutil.copy(rp,os.path.join(dd,"rotate.json"))
        open(os.path.join(dd,"title.txt"),"w").write(m.get("title","")+"\n"+m.get("author","")+"\n")
        mm=dict(m); mm.setdefault("description",""); mm.setdefault("discussion","")  # write-up task fills these
        master[name]=mm; staged+=1
    json.dump(master, open(MASTER_OUT,"w"), ensure_ascii=False, indent=1)
    print(f"staged {staged} folders / {imgs} images -> image-intake/")
    print(f"wrote {MASTER_OUT} (keyed by intake folder, for merge_records.py)")
    if not a.no_prep:
        print("running prep_images.py (resize/convert) ...")
        subprocess.run([sys.executable,f"{ROOT}/vivarium/scripts/prep_images.py"],
                       env={**os.environ,"VIV_ROOT":ROOT})
    print("\nNext (gated writes):")
    print("  python3 scripts/apply_images.py | tee /tmp/apply.log")
    print("  python3 scripts/merge_records.py --apply-log /tmp/apply.log --write")
    print("  python3 scripts/sync_images.py --write")
    print("  node --env-file=.env.vivarium scripts/images-to-r2.mjs")
    print("  node --env-file=.env.vivarium scripts/seed-new-items.mjs   # insert-only, NOT migrate-to-supabase.mjs")
    print("  (run sync_from_supabase.mjs BEFORE apply_images.py so ids assign above the true max)")
if __name__=="__main__": main()
