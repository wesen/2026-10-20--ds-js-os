#!/usr/bin/env python3
"""Phase D: picocalc-os/ becomes firmware/ (PICOCALC-REPO-LAYOUT design Section 4.1).

usage: python3 09-phase-d-rename-firmware.py [--dry-run]        (runs once, on a clean tree, with no build running)

After Phases C and E the tree holds only firmware: nucleus, sdk, natives, host, sim, ports, third_party, fs-seed,
tools, tests, docs and PLAYABLE.json. One git mv renames it, so every path inside it stays valid, and so do its
paths to the rest of the repository (${OS}/../compiler/typed, ../apps/js/picocalc, ...), which keep their depth.

Outside it, a path is rewritten where it names the tree: the "picocalc-os/" prefix, resolve('picocalc-os'),
join(root,"picocalc-os"), $root/picocalc-os, -C picocalc-os and .../picocalc-os} or line end in cji's scripts.
"picocalc-os" as the name of the operating system (comments, the about screen, picocalc-os-p4.bin, the CMake
project) is not a path and stays. Reads of old revisions keep their paths.
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
DRY = sys.argv[1:] == ["--dry-run"]
assert sys.argv[1:] in ([], ["--dry-run"])

PREFIXES = [("picocalc-os/", "firmware/")]
HISTORICAL = [
    'const path="picocalc-os/worlds/chess/"+file+".typed";',            # chess-holdout.mjs reads revision 57b2d9f
    'repo.show("eaf0872", "picocalc-os/', "repo.show('eaf0872', 'picocalc-os/", "repo.list('picocalc-os/tools', '",
    'old = "picocalc-os/compiler/rv32/60-policies.js"', '"at2a5be8f": {"path": "picocalc-os/compiler/rv32/60-policies.js"',
    "moved from picocalc-os/compiler/rv32 to",
    'got.Where.Path != "picocalc-os/compiler/typed-rv32.js"',           # where() at revision eaf0872
]
SKIP = {"pkg/tracecompiler/compiler.go", "pkg/traceapi/repo_test.go"}   # both name old layouts on purpose

EDITS = {}


def edit(path, old, new, count=1):
    EDITS.setdefault(path, []).append((old, new, count))


edit("bench/board/build.sh", "os=$root/picocalc-os", "os=$root/firmware")
edit("bench/board/stage.mjs", 'const os=join(root,"picocalc-os"),', 'const os=join(root,"firmware"),')
for r in ("agenda-wasm-world", "editor-world", "files-wasm"):
    edit(f"bench/host/replays/{r}.mjs", "const os = resolve('picocalc-os');", "const os = resolve('firmware');")
edit("bench/host/replays/run.sh", "make -s -C picocalc-os ", "make -s -C firmware ")
edit("compiler/cji/Makefile", "PICOCALC ?= $(CURDIR)/../../picocalc-os\n", "PICOCALC ?= $(CURDIR)/../../firmware\n")
for t in ("compile-test.sh", "nw-test.sh"):
    edit(f"compiler/cji/tools/rv32/{t}", "pc=${PICOCALC:-$here/../../picocalc-os}", "pc=${PICOCALC:-$here/../../firmware}")
edit("cmd/trace-repl/README.md",
     "`compiler.at(rev)` loads `picocalc-os/compiler/{typed-wasm,typed-async,typed-world,typed-rv32,typed-pie-loops}.js` and `picocalc-os/tools/{rv32-interp,typed-ray-bench}.js`",
     "`compiler.at(rev)` loads `compiler/typed/{typed-wasm,typed-async,typed-world,typed-rv32,typed-pie-loops}.js` and `bench/host/{rv32-interp,typed-ray-bench}.js` (at revisions before PICOCALC-REPO-LAYOUT, `picocalc-os/compiler/` and `picocalc-os/tools/`)")


def apply_prefixes(path, text):
    if path in SKIP:
        return text
    held = {}
    for i, h in enumerate(HISTORICAL):
        if h in text:
            key = f"\0HELD{i}\0"
            text = text.replace(h, key)
            held[key] = h
    for old, new in PREFIXES:
        text = text.replace(old, new)
    for key, h in held.items():
        text = text.replace(key, h)
    return text


def main():
    dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO, capture_output=True, text=True).stdout
    assert not dirty, "commit or stash first:\n" + dirty
    assert (REPO / "picocalc-os").is_dir() and not (REPO / "firmware").exists()
    if not DRY:
        subprocess.run(["git", "mv", "picocalc-os", "firmware"], cwd=REPO, check=True)
    changed = []
    files = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True).stdout.split("\n")
    for path in files:
        if not path or path.startswith("ttmp/") or path.endswith((".png", ".bin", ".gz", ".elf", ".jpg", ".wasm", ".o", ".ttf")):
            continue
        p = REPO / path
        if DRY and path.startswith("picocalc-os/"):
            path = "firmware/" + path[len("picocalc-os/"):]
        if not p.is_file():
            continue
        try:
            text = p.read_text()
        except UnicodeDecodeError:
            continue
        new = text
        for old, rep, count in EDITS.pop(path, []):
            found = new.count(old)
            assert (found >= 1 if count is None else found == count), (path, old, found)
            new = new.replace(old, rep)
        new = apply_prefixes(path, new)
        if new != text:
            changed.append(path)
            if not DRY:
                p.write_text(new)
    assert not EDITS, f"edits for files that do not exist: {list(EDITS)}"
    print(("would change" if DRY else "changed"), len(changed), "files:")
    for c in changed:
        print("  ", c)


if __name__ == "__main__":
    main()
