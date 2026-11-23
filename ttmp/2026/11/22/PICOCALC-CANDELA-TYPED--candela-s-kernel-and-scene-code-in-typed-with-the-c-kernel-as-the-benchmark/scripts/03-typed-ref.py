#!/usr/bin/env python3
"""03-typed-ref.py: the Typed arm's reference digests for the device (PICOCALC-CANDELA-TYPED).

usage: python3 -I 03-typed-ref.py WORK PASSES OUT.jsonl [ID ...]

Runs 03-typed-dump.mjs (the generated Typed program's WebAssembly build: every pixel output of PASSES passes per
scene, into WORK/dump), builds 03-typed-ref.c with the gallery's renderer core and scene table under the gallery's
floating-point policy, and writes one JSON line per scene: frame0, acc and disp, as `gallery digest ID PASSES psram
typed` prints them on the device."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / "AGENTS.md").exists())
FW = REPO / "firmware"
FP = ["-O2", "-ffp-contract=off", "-fno-math-errno", "-fwrapv"]
INC = [f"-I{FW / 'third_party/candela/kernel'}", f"-I{FW / 'nucleus'}"]


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    work, passes, out, ids = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve(), sys.argv[4:]
    dump = work / "dump"
    dump.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["node", str(HERE / "03-typed-dump.mjs"), str(dump), passes, *ids], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-2000:])
    ids = r.stdout.split()
    exe = work / "typed-ref"
    subprocess.run(["gcc", "-std=gnu17", *FP, *INC, str(HERE / "03-typed-ref.c"), str(FW / "nucleus/candela_gallery.c"),
                    str(FW / "third_party/candela/gallery/candela_gallery_scenes.c"), "-lm", "-o", str(exe)], check=True)
    r = subprocess.run([str(exe), passes, str(dump), *ids], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-2000:])
    out.write_text(r.stdout)
    sys.stdout.write(r.stdout)


if __name__ == "__main__":
    main()
