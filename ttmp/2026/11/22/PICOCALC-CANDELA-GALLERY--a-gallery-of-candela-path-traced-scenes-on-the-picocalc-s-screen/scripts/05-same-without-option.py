#!/usr/bin/env python3
"""05-same-without-option.py: does the playable firmware build exactly as before when PICOCALC_CANDELA_GALLERY is off?

usage: python3 -I 05-same-without-option.py WORKTREE BASE_REV BUILD_OFF [BUILD_ON]

The gallery changes three files the playable firmware compiles (nucleus/gfx.c, port/esp32p4/main/main_p4.c and the
header port/esp32p4/main/p4.h) and the two CMake files. Following PICOCALC-CANDELA-WORLD's scripts 13 and 14, this
preprocesses every playable source those files reach -- gfx.c, and every source of the build that includes p4.h --
with the exact compile command the playable build uses (BUILD_OFF/compile_commands.json, a build-smooth-chess.sh
build or reconfigure without the option), once from the worktree and once from BASE_REV's text (git show; the base
source and the base p4.h are written side by side, so its quote includes find the base header; __FILE__ is mapped back
to the real path), and compares the outputs byte for byte, including the line numbers that __LINE__ (ESP_ERROR_CHECK,
assert) writes into the firmware. With BUILD_ON (a build with the option) it reports how many preprocessed lines the
option adds to each. Then it lists every file that differs from BASE_REV under picocalc-os/ and cji/: everything else
is new and compiled only with the option (port/esp32p4/main/CMakeLists.txt adds it inside if(PICOCALC_CANDELA_GALLERY)).
Prints one line per source and exits 1 if one differs without the option."""
import difflib
import json
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

HEADERS = ["picocalc-os/port/esp32p4/main/p4.h"]
DIRECT = ["picocalc-os/nucleus/gfx.c", "picocalc-os/port/esp32p4/main/main_p4.c"]


def entries(build):
    return {str(Path(e["file"]).resolve()): e for e in json.loads((Path(build) / "compile_commands.json").read_text())}


def preprocess(entry, source, out):
    args = shlex.split(entry["command"]) if "command" in entry else list(entry["arguments"])
    cleaned, skip = [], False
    for a in args:
        if skip:
            skip = False
            continue
        if a in ("-o", "-MF", "-MT", "-MQ"):
            skip = True
            continue
        if a in ("-c", "-MD", "-MMD") or a == entry["file"]:
            continue
        cleaned.append(a)
    real = Path(entry["file"]).parent
    cleaned += ["-E", "-P", "-iquote", str(real), f"-fmacro-prefix-map={Path(source).parent}={real}", str(source), "-o", str(out)]
    subprocess.run(cleaned, cwd=entry["directory"], check=True)
    return out.read_bytes()


def git_show(wt, rev, rel):
    return subprocess.run(["git", "-C", str(wt), "show", f"{rev}:{rel}"], check=True, capture_output=True).stdout


def main():
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    wt, base, off = Path(sys.argv[1]).resolve(), sys.argv[2], sys.argv[3]
    on = entries(sys.argv[4]) if len(sys.argv) == 5 else None
    offe = entries(off)
    sources = list(DIRECT)
    for path in sorted(offe):
        p = Path(path)
        if p.suffix == ".c" and str(p).startswith(str(wt)) and re.search(r'#include\s+"p4\.h"', p.read_text(errors="replace")):
            rel = str(p.relative_to(wt))
            if rel not in sources:
                sources.append(rel)
    bad = 0
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for rel in sources:
            path = wt / rel
            e = offe.get(str(path.resolve()))
            if not e:
                print(f"not compiled without the option: {rel}")
                continue
            d = tmp / "base"
            if d.exists():
                for f in d.iterdir():
                    f.unlink()
            d.mkdir(exist_ok=True)
            old = d / path.name
            old.write_bytes(git_show(wt, base, rel))
            for h in HEADERS:
                if Path(h).parent == Path(rel).parent:
                    (d / Path(h).name).write_bytes(git_show(wt, base, h))
            a = preprocess(e, old, tmp / "a.i")
            b = preprocess(e, path, tmp / "b.i")
            same = a == b
            bad += not same
            print(f"{'same' if same else 'DIFFERENT'} without the option: {rel} ({len(b)} bytes preprocessed)")
            if not same:
                for line in list(difflib.unified_diff(a.decode(errors="replace").splitlines(), b.decode(errors="replace").splitlines(), lineterm="", n=0))[:12]:
                    print("    " + line[:200])
            if on and str(path.resolve()) in on and rel in DIRECT:
                eo = on[str(path.resolve())]
                x = preprocess(eo, old, tmp / "c.i").decode(errors="replace").splitlines()
                y = preprocess(eo, path, tmp / "d.i").decode(errors="replace").splitlines()
                added = [l for l in difflib.unified_diff(x, y, lineterm="", n=0) if l.startswith(("+", "-")) and not l.startswith(("+++", "---"))]
                print(f"  with the option: {len(added)} preprocessed lines differ from {base}")
    changed = subprocess.run(["git", "-C", str(wt), "diff", "--name-status", base, "--", "picocalc-os", "cji"], check=True,
                             capture_output=True, text=True).stdout.splitlines()
    untracked = subprocess.run(["git", "-C", str(wt), "ls-files", "--others", "--exclude-standard", "picocalc-os", "cji"], check=True,
                               capture_output=True, text=True).stdout.splitlines()
    print(f"files changed since {base} under picocalc-os/ and cji/:")
    for line in changed + ["A\t" + u + " (untracked)" for u in untracked]:
        print("  " + line)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
