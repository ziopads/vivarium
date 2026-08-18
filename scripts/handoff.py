#!/usr/bin/env python3
"""
handoff.py — run the whole hand-off from grouped book folders into the catalogue.

WHAT THIS REPLACES
------------------
Seven separate invocations, a temp file passed between two of them, two preview runs,
and an id number carried by hand from the first command to the last. Four operations
were wearing seven commands, and every seam was somewhere to make a mistake.

This runs them in order, keeps the folder-to-id mapping in memory, reads the real id
range out of apply_images.py's output instead of asking you to retype a number, and
stops at the first failure.

WHAT IT DOES NOT CHANGE
-----------------------
The underlying scripts. Each still exists and can still be run alone when something
goes wrong; this only drives them. If a step fails, the message tells you which one,
and you can pick up from there by hand.

THE ONE CONFIRMATION
--------------------
Everything before apply_images.py is reversible: sync_from_supabase.mjs only writes a
local file (with a backup), and ingest_batch.py only fills scratch directories. So the
plan is shown and confirmed once, immediately before the first step that touches the
catalogue. After that it runs through.

USAGE
    python3 scripts/handoff.py \
        --source ../vivarium-batch-processor/data/books \
        --records ../vivarium-batch-processor/data/records_source.json

    --env-file X     env file for the node steps (default .env.vivarium)
    --reset-intake   clear image-intake/ and image-ready/ leftovers first
    --yes            skip the confirmation
    --stop-before-seed   do everything except the Supabase insert

Run from the vivarium project root.
"""

import os
import re
import sys
import shlex
import argparse
import datetime
import subprocess
import tempfile


class StepFailed(Exception):
    pass


def run(cmd, label, env=None):
    """Run a command, streaming its output while capturing it. Raise on non-zero exit."""
    print(f"\n\033[1m── {label}\033[0m")
    print(f"   $ {' '.join(shlex.quote(c) for c in cmd)}\n")
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
        # PYTHONUNBUFFERED: a child process writing to a PIPE buffers its stdout in
        # blocks rather than by line, so a slow step (prep_images.py converting a
        # hundred images) looks hung until it finishes and the buffer flushes.
        env={**os.environ, "PYTHONUNBUFFERED": "1", **(env or {})},
    )
    captured = []
    for line in proc.stdout:
        sys.stdout.write(line)
        captured.append(line)
    proc.wait()
    if proc.returncode != 0:
        raise StepFailed(f"{label} exited with status {proc.returncode}")
    return "".join(captured)


def _record_keys(path):
    import json
    with open(path) as fh:
        return list(json.load(fh).keys())


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="folder of grouped book folders")
    ap.add_argument("--records", required=True, help="records_source.json for those folders")
    ap.add_argument("--env-file", default=".env.vivarium")
    ap.add_argument("--reset-intake", action="store_true")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--stop-before-seed", action="store_true")
    ap.add_argument("--no-archive", action="store_true",
                    help="don't archive the shipped books afterwards (you'll have to)")
    args = ap.parse_args()

    root = os.getcwd()
    if not os.path.isdir(os.path.join(root, "scripts")):
        sys.exit("Run this from the vivarium project root (the folder containing scripts/).")
    if not os.path.exists(os.path.join(root, args.env_file)):
        sys.exit(f"No {args.env_file} here. Pass --env-file, and check which instance you mean.")

    # ingest_batch.py resolves RELATIVE paths against VIV_ROOT (_PROJECTS), not against
    # the current directory, so anything relative typed at this shell would resolve from
    # the wrong base. Make them absolute here rather than changing that script's contract.
    source = os.path.abspath(args.source)
    records = os.path.abspath(args.records)

    # Fail on a bad path BEFORE pulling from Supabase — a wrong path shouldn't cost a sync.
    if not os.path.isdir(source):
        sys.exit(f"No such folder of book folders:\n  {source}")
    if not os.path.isfile(records):
        sys.exit(f"No such records file:\n  {records}")
    n_records = None
    try:
        import json
        with open(records) as fh:
            n_records = len(json.load(fh))
    except Exception as e:
        sys.exit(f"Could not read {records}: {e}")
    missing = [k for k in _record_keys(records) if not os.path.isdir(os.path.join(source, k))]
    if missing:
        print(f"WARNING: {len(missing)} record(s) have no matching folder under {source}:")
        for k in missing[:8]:
            print("  ", k)
        if len(missing) > 8:
            print(f"   ... and {len(missing)-8} more")
        print("ingest_batch.py will skip these. Continuing.\n")

    py = sys.executable
    envflag = f"--env-file={args.env_file}"

    try:
        # ---- 1. make local ids match reality ------------------------------------
        # apply_images.py assigns ids from the LOCAL items.json. If that file is behind
        # Supabase, new records get ids that already belong to live rows.
        out = run(["node", envflag, "scripts/sync_from_supabase.mjs"],
                  "Pulling current items from Supabase")
        m = re.search(r"True max id = (\d+)", out)
        if not m:
            raise StepFailed("Could not read the true max id from sync output.")
        max_before = int(m.group(1))
        pulled = re.search(r"Pulled (\d+) items", out)

        # ---- 2. stage + convert -------------------------------------------------
        cmd = [py, "scripts/ingest_batch.py", "--source", source, "--records", records]
        if args.reset_intake:
            cmd.append("--reset-intake")
        out = run(cmd, "Validating taxonomy, staging to image-intake, converting to webp")
        staged = re.search(r"staged (\d+) folders", out)
        n_books = int(staged.group(1)) if staged else None

        # ---- confirmation -------------------------------------------------------
        print("\n" + "=" * 68)
        print("  PLAN — nothing above this line touched the catalogue.")
        print("=" * 68)
        print(f"  instance      {args.env_file}"
              + (f"  ({pulled.group(1)} items currently in Supabase)" if pulled else ""))
        print(f"  records file  {n_records} record(s)")
        print(f"  books staged  {n_books if n_books is not None else '?'}")
        print(f"  new ids from  {max_before + 1}")
        print()
        print("  Still to run:")
        print("    apply_images.py          create records, place images   WRITES")
        print("    merge_records.py --write push in the real book data     WRITES")
        print("    sync_images.py --write   bake gallery order for online  WRITES")
        print("    images-to-r2.mjs         upload webp to R2              WRITES")
        if args.stop_before_seed:
            print("    (stopping before the Supabase insert, as asked)")
        else:
            print("    seed-new-items.mjs       insert rows into Supabase      WRITES")
        print("=" * 68)
        if not args.yes:
            if input("\nProceed? type yes: ").strip().lower() not in ("yes", "y"):
                sys.exit("Stopped. Nothing in the catalogue was changed.")

        # ---- 3. create records + place images -----------------------------------
        out = run([py, "scripts/apply_images.py"],
                  "Creating item records and placing images")
        # merge_records.py parses these same lines; we capture them rather than
        # making you pipe to a temp file and remember the path.
        new_ids = [int(x) for x in re.findall(r"created NEW item #(\d+)", out)]
        if not new_ids:
            raise StepFailed("apply_images.py created no new items — nothing to merge or seed.")
        print(f"\n   -> {len(new_ids)} new item(s), ids {min(new_ids)}..{max(new_ids)}")

        with tempfile.NamedTemporaryFile("w", suffix=".log", delete=False) as fh:
            fh.write(out)
            apply_log = fh.name

        # ---- 4. merge the enriched data ----------------------------------------
        run([py, "scripts/merge_records.py", "--apply-log", apply_log, "--write"],
            "Merging the enriched book data into those records")

        # ---- 5. bake gallery order ---------------------------------------------
        run([py, "scripts/sync_images.py", "--write"],
            "Baking gallery order into items.json (production has no folder scan)")

        # ---- 6. upload images ---------------------------------------------------
        run(["node", envflag, "scripts/images-to-r2.mjs"],
            "Uploading images to R2")

        # ---- 7. insert rows -----------------------------------------------------
        if args.stop_before_seed:
            print(f"\nStopped before seeding, as asked. To finish:\n"
                  f"  node {envflag} scripts/seed-new-items.mjs "
                  f"--ids {','.join(str(i) for i in new_ids)}")
            print("\nThen archive, or the next hand-off will re-stage these:")
            print(f"  cd {os.path.dirname(os.path.dirname(source))} "
                  f"&& python3 group_batch.py archive")
            print(f"\nNOTE: these {len(new_ids)} book(s) are in your LOCAL items.json and")
            print("their images are in R2, but nothing is in Supabase yet.")
            print(f"\n(apply log kept at {apply_log})")
            return
        else:
            # --ids, not --min: the exact ids apply_images.py actually created, so a
            # stray record in items.json can't be swept in by a range.
            run(["node", envflag, "scripts/seed-new-items.mjs",
                 "--ids", ",".join(str(i) for i in new_ids)],
                "Inserting the new rows into Supabase")

        print("\n" + "=" * 68)
        print(f"  Done — {len(new_ids)} book(s) in the catalogue, "
              f"ids {min(new_ids)}..{max(new_ids)}")
        print("=" * 68)

        # Archiving is part of finishing the hand-off, not a chore afterwards.
        # data/books/ and records_source.json are the QUEUE of what still needs
        # shipping; leaving shipped books in them means the next hand-off re-stages
        # everything and apply_images.py creates duplicate records. Relying on the
        # operator to remember this is how 37 already-catalogued books ended up
        # sitting in a pile of 375.
        processor = os.path.dirname(os.path.dirname(source))
        archiver = os.path.join(processor, "group_batch.py")
        if args.no_archive:
            print(f"\nNot archiving, as asked. Do it before the next hand-off:\n"
                  f"  cd {processor} && python3 group_batch.py archive")
        elif not os.path.exists(archiver):
            print(f"\nCould not find {archiver} — archive by hand before the next hand-off.")
        else:
            stamp = datetime.date.today().isoformat()
            run([py, archiver, "archive", "--name", stamp],
                "Archiving the shipped books out of the staging pile")

        print(f"\n(apply log kept at {apply_log} in case you need to re-run merge_records.py)")

    except StepFailed as e:
        print(f"\n\033[31mSTOPPED: {e}\033[0m")
        print("Nothing after that step ran. Fix the cause and either re-run this script")
        print("or continue by hand from the failed step — see PROCESS.md section 8.")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nInterrupted. Whatever had already run has already written.")
        sys.exit(130)


if __name__ == "__main__":
    main()
