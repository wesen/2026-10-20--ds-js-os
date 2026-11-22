#!/usr/bin/env python3
"""02-check-regenerate-fails.py: show that `node tools/gen/candela/regenerate.mjs --check` fails for each kind of drift.

usage: python3 -I 02-check-regenerate-fails.py

Each case changes one thing under picocalc-os/third_party/candela, runs --check, expects exit status 1 and a message
naming the file, and puts the original bytes back before the next case. The last case runs regenerate.mjs without
--check on a corrupted generated file and expects it to be rewritten to the tracked bytes. The tree must start with
--check passing, and it is checked again at the end."""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = next(p for p in HERE.parents if (p / ".git").exists())
CDL = REPO / "picocalc-os/third_party/candela"
GEN = ["node", str(REPO / "tools/gen/candela/regenerate.mjs")]


def run(check=True):
    r = subprocess.run(GEN + (["--check"] if check else []), capture_output=True, text=True, cwd=REPO)
    return r.returncode, r.stdout + r.stderr


def expect(name, code, out, want_code, want_text):
    ok = code == want_code and want_text in out
    print(f"{'ok  ' if ok else 'FAIL'} {name}: exit {code}; {out.strip().splitlines()[-1] if out.strip() else ''}")
    return ok


def main():
    code, out = run()
    if code != 0:
        sys.exit("--check does not pass at the start:\n" + out)
    good = True

    # 1. a generated file edited by hand
    p = CDL / "kernel/cdl_post.cpp"
    orig = p.read_bytes()
    try:
        p.write_bytes(orig + b"// edited\n")
        good &= expect("edited generated file", *run(), 1, "kernel/cdl_post.cpp")
    finally:
        p.write_bytes(orig)

    # 2. a file nobody owns in kernel/
    stray = CDL / "kernel/zz-stray.h"
    if stray.exists():
        sys.exit(f"{stray} exists already")
    body = b"/* written by 02-check-regenerate-fails.py */\n"
    try:
        stray.write_bytes(body)
        good &= expect("unlisted file", *run(), 1, "kernel/zz-stray.h: not listed in VENDOR.json")
    finally:
        if stray.is_file() and stray.read_bytes() == body:
            stray.unlink()

    # 3. a pinned Candela input changed
    p = CDL / "content/presets/E-02-toon.md"
    orig_md = p.read_bytes()
    try:
        p.write_bytes(orig_md + b"\n")
        good &= expect("changed pinned input", *run(), 1, "content/presets/E-02-toon.md:")
    finally:
        p.write_bytes(orig_md)

    # 4. a hand-written file missing (renamed away and back)
    p = CDL / "vm/cdl_vm_ck_math.h"
    moved = p.with_name("cdl_vm_ck_math.h.moved")
    if moved.exists():
        sys.exit(f"{moved} exists already")
    try:
        p.rename(moved)
        good &= expect("missing hand-written file", *run(), 1, "vm/cdl_vm_ck_math.h: hand-written file missing")
    finally:
        if moved.exists() and not p.exists():
            moved.rename(p)

    # 5. VENDOR.json edited by hand
    p = CDL / "VENDOR.json"
    orig_v = p.read_bytes()
    try:
        p.write_bytes(orig_v.replace(b'"kind": "hand-written"', b'"kind": "handwritten"', 1))
        good &= expect("edited VENDOR.json", *run(), 1, "VENDOR.json")
    finally:
        p.write_bytes(orig_v)

    # 6. without --check, a corrupted generated file is rewritten to the tracked bytes
    p = CDL / "gallery/candela_gallery_scenes.c"
    orig_c = p.read_bytes()
    try:
        p.write_bytes(orig_c[:-10])
        code, out = run(check=False)
        good &= expect("regenerate rewrites", code, out, 0, "gallery/candela_gallery_scenes.c")
        same = p.read_bytes() == orig_c
        print(f"{'ok  ' if same else 'FAIL'} rewritten file equals the tracked bytes")
        good &= same
    finally:
        p.write_bytes(orig_c)

    code, out = run()
    good &= expect("tree restored", code, out, 0, "current")
    sys.exit(0 if good else 1)


if __name__ == "__main__":
    main()
