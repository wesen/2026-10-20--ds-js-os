#!/usr/bin/env python3
"""Phase C: give the compilers their home under compiler/ (PICOCALC-REPO-LAYOUT design Section 4.1).

usage: python3 06-phase-c-move-compiler.py [--dry-run]        (runs once, on a clean tree, with no build running)

Moves (git mv):
  picocalc-os/compiler/typed-{wasm,async,world,rv32,pie-loops}.js   -> compiler/typed/
  picocalc-os/compiler/rv32/                                        -> compiler/typed/rv32/
  picocalc-os/tools/typed-inspect, typed-inspect.mjs               -> compiler/typed/tools/
  picocalc-os/tools/{rv32-interp,typed-ray-bench}.js               -> bench/host/
  picocalc-os/tests/typed-*.test.mjs                               -> tests/compiler/
  picocalc-os/compiler/raytrace.js, raytrace-material.js           -> picocalc-os/worlds/raytrace/link.js, link-material.js
  picocalc-os/compiler/candela.js                                  -> picocalc-os/worlds/candela/link.js
  picocalc-os/compiler/mobile-painter.js                           -> picocalc-os/worlds/chess/link-painter.js
  cji/                                                              -> compiler/cji/
(A link adapter goes beside its world; Phase E moves the world directories to apps/typed/ with them.)

Then rewrites the references outside ttmp/: repository-relative prefixes, the relative URLs in the moved tests and
tools, the firmware CMake (CJI_ROOT, BUNDLE_EXTRA, link adapters), the host Makefile's test lines, cji's own
relative paths to the rest of the repository, bench/, and the trace REPL's Go and JavaScript. Every rewrite asserts
how often its old text occurs, so a reference this script does not know about fails it instead of being left.
"""
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
DRY = sys.argv[1:] == ["--dry-run"]
assert sys.argv[1:] in ([], ["--dry-run"])

MOVES = [(f"picocalc-os/compiler/typed-{n}.js", f"compiler/typed/typed-{n}.js") for n in ("wasm", "async", "world", "rv32", "pie-loops")] + [
    ("picocalc-os/compiler/rv32", "compiler/typed/rv32"),
    ("picocalc-os/tools/typed-inspect", "compiler/typed/tools/typed-inspect"),
    ("picocalc-os/tools/typed-inspect.mjs", "compiler/typed/tools/typed-inspect.mjs"),
    ("picocalc-os/tools/rv32-interp.js", "bench/host/rv32-interp.js"),
    ("picocalc-os/tools/typed-ray-bench.js", "bench/host/typed-ray-bench.js"),
    ("picocalc-os/tests/typed-rv32.test.mjs", "tests/compiler/typed-rv32.test.mjs"),
    ("picocalc-os/tests/typed-wasm-inspect.test.mjs", "tests/compiler/typed-wasm-inspect.test.mjs"),
    ("picocalc-os/tests/typed-inspect.test.mjs", "tests/compiler/typed-inspect.test.mjs"),
    ("picocalc-os/tests/typed-pie-loops.test.mjs", "tests/compiler/typed-pie-loops.test.mjs"),
    ("picocalc-os/compiler/raytrace.js", "picocalc-os/worlds/raytrace/link.js"),
    ("picocalc-os/compiler/raytrace-material.js", "picocalc-os/worlds/raytrace/link-material.js"),
    ("picocalc-os/compiler/candela.js", "picocalc-os/worlds/candela/link.js"),
    ("picocalc-os/compiler/mobile-painter.js", "picocalc-os/worlds/chess/link-painter.js"),
    ("cji", "compiler/cji"),
]

EDITS = {}   # path (after the move) -> [(old, new, count)]


def edit(path, old, new, count=1):
    EDITS.setdefault(path, []).append((old, new, count))


# --- repository-relative prefixes, wherever a file names them -------------------------------------------------
PREFIXES = [
    ("picocalc-os/compiler/typed-", "compiler/typed/typed-"),
    ("picocalc-os/compiler/rv32/", "compiler/typed/rv32/"),
    ("picocalc-os/tools/rv32-interp.js", "bench/host/rv32-interp.js"),
    ("picocalc-os/tools/typed-ray-bench.js", "bench/host/typed-ray-bench.js"),
    ("picocalc-os/tools/typed-inspect", "compiler/typed/tools/typed-inspect"),
    ("picocalc-os/tests/typed-", "tests/compiler/typed-"),
    ("picocalc-os/compiler/raytrace.js", "picocalc-os/worlds/raytrace/link.js"),
    ("picocalc-os/compiler/raytrace-material.js", "picocalc-os/worlds/raytrace/link-material.js"),
    ("picocalc-os/compiler/candela.js", "picocalc-os/worlds/candela/link.js"),
    ("picocalc-os/compiler/mobile-painter.js", "picocalc-os/worlds/chess/link-painter.js"),
]

# --- the firmware's CMake -----------------------------------------------------------------------------------------
P4 = "picocalc-os/port/esp32p4/main/CMakeLists.txt"
# ${OS}/compiler/typed-*.js becomes ${OS}/../compiler/typed/typed-*.js in apply_prefixes.
edit("picocalc-os/port/esp32p4/CMakeLists.txt", '"${CMAKE_CURRENT_LIST_DIR}/../../../cji"', '"${CMAKE_CURRENT_LIST_DIR}/../../../compiler/cji"')
edit(P4, "${OS}/compiler/candela.js", "${OS}/worlds/candela/link.js")
edit(P4, "${OS}/compiler/raytrace.js", "${OS}/worlds/raytrace/link.js")
edit(P4, "${OS}/compiler/raytrace-material.js", "${OS}/worlds/raytrace/link-material.js")
edit(P4, '"${OS}/compiler/mobile-painter.js"', '"${OS}/worlds/chess/link-painter.js"')

# --- the host Makefile runs the compiler tests from their new place ----------------------------------------------
for t in ("typed-rv32", "typed-wasm-inspect", "typed-inspect", "typed-pie-loops"):
    edit("picocalc-os/Makefile", f"\t$(NODE) tests/{t}.test.mjs\n", f"\t$(NODE) ../tests/compiler/{t}.test.mjs\n")

# --- the moved compiler tests: they sat in picocalc-os/tests, now in tests/compiler ------------------------------
T = "tests/compiler/"
edit(T + "typed-rv32.test.mjs", 'new URL("../compiler/" + file, import.meta.url)', 'new URL("../../compiler/typed/" + file, import.meta.url)')
edit(T + "typed-rv32.test.mjs", 'new URL("../" + file, import.meta.url)', 'new URL("../../" + file, import.meta.url)', 12)
edit(T + "typed-rv32.test.mjs", '"compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js", "tools/typed-ray-bench.js"',
     '"compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "bench/host/rv32-interp.js", "bench/host/typed-ray-bench.js"')
edit(T + "typed-rv32.test.mjs", '"compiler/typed-wasm.js", "compiler/typed-rv32.js", "tools/rv32-interp.js"]',
     '"compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "bench/host/rv32-interp.js"]', 11)
edit(T + "typed-rv32.test.mjs", 'new URL("../worlds/raytrace/raytrace.typed", import.meta.url)',
     'new URL("../../picocalc-os/worlds/raytrace/raytrace.typed", import.meta.url)', 2)
edit(T + "typed-rv32.test.mjs", 'new URL("../compiler/rv32/build.mjs", import.meta.url)', 'new URL("../../compiler/typed/rv32/build.mjs", import.meta.url)')
edit(T + "typed-rv32.test.mjs", 'new URL("../compiler/typed-rv32.js", import.meta.url)', 'new URL("../../compiler/typed/typed-rv32.js", import.meta.url)')
for t, names in (("typed-wasm-inspect", ("wasm", "async", "rv32")), ("typed-pie-loops", ("wasm", "rv32", "pie-loops"))):
    for n in names:
        edit(T + t + ".test.mjs", f'import "../compiler/typed-{n}.js";', f'import "../../compiler/typed/typed-{n}.js";')
edit(T + "typed-inspect.test.mjs", 'new URL("../compiler/"+f+".js",import.meta.url)', 'new URL("../../compiler/typed/"+f+".js",import.meta.url)')
edit(T + "typed-inspect.test.mjs", 'new URL("../tools/typed-inspect.mjs",import.meta.url)', 'new URL("../../compiler/typed/tools/typed-inspect.mjs",import.meta.url)')
edit(T + "typed-pie-loops.test.mjs", 'new URL("../worlds/raytrace/raytrace.typed",import.meta.url)',
     'new URL("../../picocalc-os/worlds/raytrace/raytrace.typed",import.meta.url)', None)

# --- cji, one level deeper: its paths to the rest of the repository ---------------------------------------------
edit("compiler/cji/Makefile", "$(RV32)/rv32emu: ../bench/emu/emu.c", "$(RV32)/rv32emu: ../../bench/emu/emu.c")
edit("compiler/cji/Makefile", "PICOCALC ?= $(CURDIR)/../picocalc-os", "PICOCALC ?= $(CURDIR)/../../picocalc-os")
for t in ("compile-test.sh", "nw-test.sh"):
    edit("compiler/cji/tools/rv32/" + t, "pc=${PICOCALC:-$here/../picocalc-os}", "pc=${PICOCALC:-$here/../../picocalc-os}")
edit("bench/emu/Makefile", "FW      := ../../cji/tools/rv32/fw", "FW      := ../../compiler/cji/tools/rv32/fw")
edit("bench/emu/Makefile", "That runtime lives in cji/tools/rv32/fw/ because", "That runtime lives in compiler/cji/tools/rv32/fw/ because")
edit("bench/emu/emu.c", "(cji/tools/rv32/fw/hostcalls.S numbers them)", "(compiler/cji/tools/rv32/fw/hostcalls.S numbers them)")
edit("bench/README.md", "(`cji/tools/rv32/fw/`)", "(`compiler/cji/tools/rv32/fw/`)")
edit("AGENTS.md", "The [CJI compiler](cji/) and the [Typed compiler](picocalc-os/compiler/)",
     "The [CJI compiler](compiler/cji/) and the [Typed compiler](compiler/typed/)")
edit("AGENTS.md", "[CJI pass list](cji/src/pipeline.js)", "[CJI pass list](compiler/cji/src/pipeline.js)")

# --- the trace REPL: worktree paths move, historical revisions keep theirs ---------------------------------------
edit("pkg/traceapi/compiler_test.go", 'got.Where.Path != "picocalc-os/compiler/typed-rv32.js"', 'got.Where.Path != "compiler/typed/typed-rv32.js"')
edit("pkg/traceapi/rv32_test.go", 'filepath.Join(root, "picocalc-os/tools/rv32-interp.js")', 'filepath.Join(root, "bench/host/rv32-interp.js")')
EX = ('  const path = "picocalc-os/compiler/rv32/60-policies.js";\n'
      '  const now = repo.read(path), then = repo.show("2a5be8f", path);\n'
      '  return {path, worktree: {sha256: now.sha256, bytes: now.bytes}, at2a5be8f: {revision: then.revision, sha256: then.sha256, bytes: then.bytes},\n'
      '          same: now.sha256 === then.sha256, sources: repo.list("picocalc-os/compiler/rv32").map(e => e.name)};')
EX_NEW = ('  // The backend moved from picocalc-os/compiler/rv32 to compiler/typed/rv32 (PICOCALC-REPO-LAYOUT); 2a5be8f has the old path.\n'
          '  const path = "compiler/typed/rv32/60-policies.js", old = "picocalc-os/compiler/rv32/60-policies.js";\n'
          '  const now = repo.read(path), then = repo.show("2a5be8f", old);\n'
          '  return {path, worktree: {sha256: now.sha256, bytes: now.bytes}, at2a5be8f: {path: old, revision: then.revision, sha256: then.sha256, bytes: then.bytes},\n'
          '          same: now.sha256 === then.sha256, sources: repo.list("compiler/typed/rv32").map(e => e.name)};')
for f in ("cmd/trace-repl/examples/23-files-at-revisions.js", "cmd/trace-repl/doc/02-trace-repl-query-examples.md"):
    edit(f, EX, EX_NEW)
edit("cmd/trace-repl/doc/02-trace-repl-query-examples.md",
     '  "path": "picocalc-os/compiler/rv32/60-policies.js",\n  "worktree": {"sha256": "313c0c4a…", "bytes": 3893},\n  "at2a5be8f": {"revision": "2a5be8f7…",',
     '  "path": "compiler/typed/rv32/60-policies.js",\n  "worktree": {"sha256": "313c0c4a…", "bytes": 3893},\n  "at2a5be8f": {"path": "picocalc-os/compiler/rv32/60-policies.js", "revision": "2a5be8f7…",')

# --- the RV32 backend's build instructions: run from the repository root now. The bundle's generated header line
# ("// Generated from compiler/rv32/ by compiler/rv32/build.mjs.") is kept, so the moved bundle stays byte-identical.
B = "compiler/typed/rv32/build.mjs"
edit(B, "// Build compiler/typed-rv32.js from the modules in this directory, in file-name order.\n"
        "//   node compiler/rv32/build.mjs          write the bundle\n"
        "//   node compiler/rv32/build.mjs --check  exit 1 if the committed bundle is stale",
        "// Build compiler/typed/typed-rv32.js from the modules in this directory, in file-name order.\n"
        "//   node compiler/typed/rv32/build.mjs          write the bundle\n"
        "//   node compiler/typed/rv32/build.mjs --check  exit 1 if the committed bundle is stale")
edit(B, 'console.error("compiler/typed-rv32.js differs from the build of compiler/rv32/. Edit the files in " +\n'
        '                "compiler/rv32/, never the bundle, then run node compiler/rv32/build.mjs.");',
        'console.error("compiler/typed/typed-rv32.js differs from the build of compiler/typed/rv32/. Edit the files in " +\n'
        '                "compiler/typed/rv32/, never the bundle, then run node compiler/typed/rv32/build.mjs.");')
R = "compiler/typed/rv32/README.md"
edit(R, "`compiler/typed-rv32.js` is built from the files in this directory.", "`compiler/typed/typed-rv32.js` is built from the files in this directory.")
edit(R, "node compiler/rv32/build.mjs          # rewrite compiler/typed-rv32.js", "node compiler/typed/rv32/build.mjs          # rewrite compiler/typed/typed-rv32.js")
edit(R, "node compiler/rv32/build.mjs --check  # fail if it is stale (tests/typed-rv32.test.mjs runs this)",
        "node compiler/typed/rv32/build.mjs --check  # fail if it is stale (tests/compiler/typed-rv32.test.mjs runs this)")

# --- bench/host/ray-profile.mjs loads its neighbours ------------------------------------------------------------
edit("bench/host/ray-profile.mjs", '"picocalc-os/compiler/typed-wasm.js", "picocalc-os/compiler/typed-rv32.js", "picocalc-os/tools/rv32-interp.js", "picocalc-os/tools/typed-ray-bench.js"',
     '"compiler/typed/typed-wasm.js", "compiler/typed/typed-rv32.js", "bench/host/rv32-interp.js", "bench/host/typed-ray-bench.js"')
edit("bench/lib/compiler.mjs", 'repoPath("picocalc-os/compiler", file)', 'repoPath("compiler/typed", file)')
edit("bench/board/stage.mjs", 'read(join(os,"compiler",n+".js"),"utf8")', 'read(join(root,"compiler/typed",n+".js"),"utf8")')


# Text that names a path at an old revision keeps it: these are reads of history, not of the tree.
HISTORICAL = ['repo.show("eaf0872", "picocalc-os/', "repo.show('eaf0872', 'picocalc-os/", "repo.list('picocalc-os/tools', '",
              'old = "picocalc-os/compiler/rv32/60-policies.js"', '"at2a5be8f": {"path": "picocalc-os/compiler/rv32/60-policies.js"',
              "moved from picocalc-os/compiler/rv32 to"]
# The revision-aware module table lists the old paths on purpose.
SKIP = {"pkg/tracecompiler/compiler.go"}


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
    # ${OS}/compiler/typed-*.js in the firmware's CMake: the compiler is no longer under ${OS}.
    text = text.replace("${OS}/compiler/typed-", "${OS}/../compiler/typed/typed-")
    for key, h in held.items():
        text = text.replace(key, h)
    return text


def tracked():
    return subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True).stdout.split("\n")


def main():
    dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO, capture_output=True, text=True).stdout
    assert not dirty, "commit or stash first:\n" + dirty
    for src, dest in MOVES:
        assert (REPO / src).exists(), src
        assert not (REPO / dest).exists(), dest
        if not DRY:
            (REPO / dest).parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "mv", src, dest], cwd=REPO, check=True)
    changed = []
    for path in tracked():
        if not path or path.startswith("ttmp/") or path.endswith((".png", ".bin", ".gz", ".elf", ".jpg", ".wasm", ".o")):
            continue
        p = REPO / path
        if DRY:
            # In a dry run the files are still at their old places: look edits up by the path they will have.
            for src, dest in MOVES:
                if path == src or path.startswith(src + "/"):
                    path = dest + path[len(src):]
                    break
        if not p.is_file():
            continue
        try:
            text = p.read_text()
        except UnicodeDecodeError:
            continue
        # Exact edits first (they name the old text), then the prefix rewrite over the result.
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
