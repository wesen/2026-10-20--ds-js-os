#!/usr/bin/env python3
"""08-same-build-files.py: do the CMake changes leave the playable build's configuration as it was without the option?

usage: python3 -I 08-same-build-files.py BASE_SRC BASE_BUILD WORKTREE OFF_BUILD

BASE_SRC is BASE_REV's picocalc-os/ and cji/ (git archive), BASE_BUILD a reconfigure of it with build-smooth-chess.sh's
arguments, OFF_BUILD the same reconfigure of the worktree (no PICOCALC_CANDELA_GALLERY). Compares, after replacing each
tree's source and build paths with placeholders: every compile command (compile_commands.json), the build graph
(build.ninja), and the manifests and bundle lists CMake writes at configure time (esp-idf/main/*.json, *.list). Prints
the differences and exits 1 if there are any."""
import difflib
import re
import json
import sys
from pathlib import Path


VERSION = re.compile(r'-DPROJECT_VER=\\*"[^"\\]*\\*"')
PYENV = re.compile(r"/python_env/idf5\.4_py3\.\d+_env/")
GITREF = re.compile(r" \S*/\.git/\S*")   # ESP-IDF re-runs CMake when a git checkout's HEAD moves (the version string)
SEEN = set()


def norm(text, src, build):
    """Placeholders for the trees' paths, and for two things that are not the gallery's: the app version string
    (git describe of the tree that was configured) and which ESP-IDF Python environment the shell selected."""
    for pat, tag in ((VERSION, "@PROJECT_VER@"), (PYENV, "/python_env/@PYTHON@/"), (GITREF, "")):
        for m in pat.findall(text):
            SEEN.add(m)
        text = pat.sub(tag, text)
    return text.replace(str(build), "@BUILD@").replace(str(src), "@SRC@")


def main():
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    bs, bb, ws, wb = (Path(p).resolve() for p in sys.argv[1:])
    bad = 0

    def compare(name, a, b):
        nonlocal bad
        if a == b:
            print(f"same: {name}")
            return
        bad += 1
        print(f"DIFFERENT: {name}")
        for line in list(difflib.unified_diff(a.splitlines(), b.splitlines(), lineterm="", n=0))[:10]:
            print("    " + line[:220])

    cc = lambda build, src: sorted(norm(json.dumps(e, sort_keys=True), src, build) for e in json.loads((build / "compile_commands.json").read_text()))
    compare("compile_commands.json", "\n".join(cc(bb, bs)), "\n".join(cc(wb, ws)))
    # CMake sorts the paths of its own re-run dependencies, and the two trees' paths sort differently: compare those
    # two lines (RERUN_CMAKE and the phony rule for the same files) as sets of tokens
    def ninja(build, src):
        lines = norm((build / "build.ninja").read_text(), src, build).splitlines()
        return "\n".join(" ".join(sorted(l.split())) if l.startswith("build ") and ("RERUN_CMAKE" in l or l.endswith(": phony")) else l for l in lines)
    compare("build.ninja", ninja(bb, bs), ninja(wb, ws))
    names = sorted({p.name for p in (bb / "esp-idf/main").glob("*.json")} | {p.name for p in (wb / "esp-idf/main").glob("*.json")})
    for n in names:
        a, b = bb / "esp-idf/main" / n, wb / "esp-idf/main" / n
        compare(f"esp-idf/main/{n}", norm(a.read_text(), bs, bb) if a.exists() else "<missing>", norm(b.read_text(), ws, wb) if b.exists() else "<missing>")
    print("set aside (not the gallery's):", sorted(SEEN))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
