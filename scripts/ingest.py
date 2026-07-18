#!/usr/bin/env python3
"""
ingest.py — one command to ingest a batch of book photos, safely.

Orchestrates the (individually tested) pipeline scripts behind a single resumable
state machine, so the 8-step dance becomes:

    python3 scripts/ingest.py "vivarium-content/<batch>"     # runs until it needs you
    # ... fill _ingest/pending.csv in a Cowork conversation (set status=ready) ...
    python3 scripts/ingest.py "vivarium-content/<batch>" --resume
    # ... review the summary ...
    python3 scripts/ingest.py "vivarium-content/<batch>" --resume --approve   # seeds live

STAGES (tracked in vivarium-content/_ingest/ingest_state.json, so it resumes):
  1 verify_live  sync_from_supabase.mjs — pulls live→local, records the TRUE max id.
                 ENFORCED: if live is unreachable, the batch stops here. This is what
                 makes id collisions impossible (new ids are always above the live max).
  2 prep         copy the batch's per-book folders into image-intake, then prep_images.py
  3 stage        apply_images.py — creates skeleton records at ids above the true max
  4 enrich       export_pending_csv.py, then PAUSE for the Cowork enrichment pass
  5 merge        merge_results.py — folds the filled CSV into local items.json
  6 publish      images-to-r2.mjs + seed-new-items.mjs (INSERT-ONLY) — gated behind --approve

BATCH LAYOUT: <batch> is a folder with one sub-folder per book, each holding the
photos named 1.jpg (front cover), 2.jpg (copyright), 3.jpg (rear ISBN, optional).

Safety: verify_live always precedes id assignment; the seed is always insert-only
(aborts on any collision); nothing touches live before --approve; every step backs up.
"""
import os, re, sys, json, shutil, subprocess, argparse

ROOT = os.environ.get("VIV_ROOT", "/Users/bjameshaskins/Desktop/_PROJECTS")
WEB = f"{ROOT}/vivarium"
SCRIPTS = f"{WEB}/scripts"
INTAKE = f"{ROOT}/vivarium-content/image-intake"
READY = f"{ROOT}/vivarium-content/image-ready"
INGEST = f"{ROOT}/vivarium-content/_ingest"
STATE_FILE = f"{INGEST}/ingest_state.json"
CSV = f"{INGEST}/pending.csv"
MANIFEST = f"{INGEST}/pending.json"
ENVFILE = f"{WEB}/.env.local"
IMG_EXTS = (".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff", ".webp", ".bmp")
ORDER = ["verify_live", "prep", "stage", "enrich", "merge", "publish"]


def load_state():
    try:
        return json.load(open(STATE_FILE))
    except Exception:
        return {}


def save_state(s):
    os.makedirs(INGEST, exist_ok=True)
    json.dump(s, open(STATE_FILE, "w"), indent=1)


def banner(msg):
    print(f"\n{'─' * 4} {msg} {'─' * (60 - len(msg))}")


def reset_scratch():
    """Empty the driver-owned scratch so a batch can never inherit stale folders
    (which would create phantom duplicate records). Never touches your source batch
    folder or public/items/ (the real, id-keyed images already destined for R2)."""
    for d in (INTAKE, READY):
        if os.path.isdir(d):
            for name in os.listdir(d):
                p = os.path.join(d, name)
                shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    for f in (CSV, MANIFEST):
        if os.path.exists(f):
            os.remove(f)


def run_python(script):
    env = dict(os.environ, VIV_ROOT=ROOT)
    r = subprocess.run([sys.executable, f"{SCRIPTS}/{script}"], env=env)
    if r.returncode != 0:
        raise SystemExit(f"✗ {script} failed (exit {r.returncode}). Nothing further done.")


def run_node(script, args=None):
    if not os.path.exists(ENVFILE):
        raise SystemExit(f"✗ {ENVFILE} not found — needed for Supabase/R2 credentials.")
    cmd = ["node", f"--env-file={ENVFILE}", f"{SCRIPTS}/{script}", *(args or [])]
    r = subprocess.run(cmd, cwd=WEB, capture_output=True, text=True)
    print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="")
    if r.returncode != 0:
        raise SystemExit(f"✗ {script} failed (exit {r.returncode}). Nothing further done.")
    return r.stdout


# --------------------------------------------------------------------------- stages
def stage_verify_live(state, args):
    out = run_node("sync_from_supabase.mjs")
    m = re.search(r"max id\s*=\s*(\d+)", out)
    if not m:
        raise SystemExit("✗ Couldn't read the true max id from sync output — stopping.")
    state["root_maxid"] = int(m.group(1))
    print(f"✓ Live max id = {state['root_maxid']}. New records will start at {state['root_maxid'] + 1}.")


def stage_prep(state, args):
    batch = state["folder"]
    books = [d for d in sorted(os.listdir(batch))
             if os.path.isdir(f"{batch}/{d}")
             and any(f.lower().endswith(IMG_EXTS) for f in os.listdir(f"{batch}/{d}"))]
    if not books:
        raise SystemExit(f"✗ No book sub-folders with photos found in {batch}.")
    os.makedirs(INTAKE, exist_ok=True)
    for b in books:
        shutil.copytree(f"{batch}/{b}", f"{INTAKE}/{b}", dirs_exist_ok=True)
    print(f"✓ Staged {len(books)} book folder(s) into image-intake.")
    run_python("prep_images.py")


def stage_stage(state, args):
    run_python("apply_images.py")
    try:
        manifest = json.load(open(MANIFEST))
        state["created_ids"] = [i["id"] for i in manifest.get("items", [])]
        print(f"✓ Created {len(state['created_ids'])} skeleton record(s): "
              f"{min(state['created_ids'])}–{max(state['created_ids'])}.")
    except Exception:
        state["created_ids"] = []


def stage_enrich(state, args):
    run_python("export_pending_csv.py")


def csv_ready_count():
    if not os.path.exists(CSV):
        return 0
    import csv as _csv
    return sum(1 for r in _csv.DictReader(open(CSV))
               if (r.get("status") or "").strip().lower() == "ready")


def stage_merge(state, args):
    run_python("merge_results.py")


def stage_publish(state, args):
    m1 = state["root_maxid"] + 1
    run_node("images-to-r2.mjs")
    run_node("seed-new-items.mjs", ["--min", str(m1)])


# --------------------------------------------------------------------------- driver
def main():
    ap = argparse.ArgumentParser(description="One-command batch ingest for Vivarium.")
    ap.add_argument("batch", nargs="?", help="path to the batch folder (dir of per-book folders)")
    ap.add_argument("--resume", action="store_true", help="continue from the last completed stage")
    ap.add_argument("--approve", action="store_true", help="allow the publish stage to write to live")
    ap.add_argument("--yes", action="store_true", help="alias for --approve")
    ap.add_argument("--force", action="store_true", help="proceed even if image-intake is non-empty")
    ap.add_argument("--status", action="store_true", help="print current batch state and exit")
    args = ap.parse_args()
    args.approve = args.approve or args.yes

    state = load_state()
    if args.status:
        print(json.dumps(state or {"(no batch in progress)": True}, indent=1))
        return

    if not args.resume:
        if not args.batch:
            raise SystemExit("Give a batch folder:  ingest.py \"vivarium-content/<batch>\"")
        folder = os.path.abspath(args.batch)
        if not os.path.isdir(folder):
            raise SystemExit(f"✗ Not a folder: {folder}")
        if state.get("done") and not state.get("published"):
            raise SystemExit(
                f"A batch is already in progress ({state.get('folder')}). "
                f"Finish it (--resume) or delete {STATE_FILE} to start over.")
        state = {"folder": folder, "done": [], "created_ids": [], "root_maxid": None}
        save_state(state)
        reset_scratch()   # start every batch from a clean slate — no inherited folders
        print("Cleared staging (image-intake/, image-ready/, _ingest working files).")
    elif not state:
        raise SystemExit("Nothing to resume — no batch state found.")

    done = set(state.get("done", []))
    for st in ORDER:
        if st in done:
            continue

        # Gate 1 — Cowork enrichment pause (between enrich and merge)
        if st == "merge" and csv_ready_count() == 0:
            print(f"\n⏸  Enrichment needed. Fill {CSV} in a Cowork conversation")
            print("   (capture ISBN, look it up, fill fields, set status=ready), then:")
            print(f'   python3 scripts/ingest.py --resume')
            return

        # Gate 2 — approval before anything hits live
        if st == "publish" and not args.approve:
            ids = state.get("created_ids", [])
            rng = f"{min(ids)}–{max(ids)}" if ids else "(none)"
            print(f"\n⏸  Ready to publish {len(ids)} record(s) [{rng}] to live.")
            print("   This uploads images to R2 and INSERT-ONLY seeds new ids (aborts on collision).")
            print("   Nothing has touched live yet. To proceed:")
            print(f'   python3 scripts/ingest.py --resume --approve')
            return

        banner(f"stage: {st}")
        globals()[f"stage_{st}"](state, args)
        state["done"] = sorted(set(state.get("done", []) + [st]), key=ORDER.index)
        if st == "publish":
            state["published"] = True
        save_state(state)

        # Pause right after emitting the review CSV
        if st == "enrich":
            print(f"\n⏸  Wrote {CSV}. Fill it in a Cowork conversation (set status=ready), then:")
            print(f'   python3 scripts/ingest.py --resume')
            return

    reset_scratch()
    try:
        os.remove(STATE_FILE)
    except OSError:
        pass
    print("\n✓ Batch complete — records enriched and seeded to live. "
          "Descriptions fill in via the write-up task.")
    print("  Staging cleaned automatically (image-intake/, image-ready/, _ingest, state).")


if __name__ == "__main__":
    main()
