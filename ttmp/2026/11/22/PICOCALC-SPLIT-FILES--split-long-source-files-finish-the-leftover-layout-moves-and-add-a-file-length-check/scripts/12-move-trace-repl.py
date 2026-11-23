#!/usr/bin/env python3
"""Move the trace REPL under tools/trace-repl/ (PICOCALC-REPO-LAYOUT Section 4.1's row, left by its Section 10).

usage: python3 12-move-trace-repl.py [--dry-run]       (on a clean tree)

  cmd/trace-repl/        -> tools/trace-repl/            the command, its help pages (doc/) and examples
  pkg/trace*/            -> tools/trace-repl/pkg/trace*/

go.mod stays at the root (module github.com/go-go-golems/picocalc-trace), so `go test ./...` still covers it; the
import paths gain tools/trace-repl/. Rewrites outside ttmp/ (the work log keeps its history):
  "cmd/trace-repl" -> "tools/trace-repl", "pkg/trace" -> "tools/trace-repl/pkg/trace" (import paths, docs, comments,
  the repo test's README path); the pkg tests' "../../ttmp" -> "../../../../ttmp" (two levels deeper; the command's
  tests stay at the same depth). pkg/tracecompiler's revision-aware path table names compiler files, not these, and
  is not touched beyond its import path.
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
DRY = sys.argv[1:] == ["--dry-run"]
assert sys.argv[1:] in ([], ["--dry-run"]), __doc__
PKGS = sorted(p.name for p in (REPO / "pkg").iterdir() if p.is_dir() and p.name.startswith("trace"))
assert PKGS == ["traceapi", "tracearchive", "tracecompiler", "tracehardware", "tracerepl", "tracerepo", "traceresults",
                "tracerv32", "tracesimd"], PKGS
assert sorted(p.name for p in (REPO / "pkg").iterdir()) == PKGS, "pkg/ holds something else too"
MOVES = [("cmd/trace-repl", "tools/trace-repl")] + [(f"pkg/{p}", f"tools/trace-repl/pkg/{p}") for p in PKGS]
SPECIFIC = {   # before the prefix rules: table rows that named cmd/ and pkg/ together
    "AGENTS.md": [("| `cmd/trace-repl`, `pkg/` | The compiler-evidence workbench (Go and goja) |",
                   "| `tools/trace-repl/` | The compiler-evidence workbench (Go and goja; `pkg/` holds its packages) |", 1)],
    "docs/README.md": [("| `cmd/trace-repl`, `pkg/` | The trace REPL (Go and goja) |", "| `tools/trace-repl/` | The trace REPL (Go and goja) |", 1)],
    "tools/trace-repl/pkg/traceapi/repo_test.go": [('filepath.Join(root, "cmd", "trace-repl", "README.md")',
                                                    'filepath.Join(root, "tools", "trace-repl", "README.md")', 1)],
}
RULES = [("cmd/trace-repl", "tools/trace-repl"), ("pkg/trace", "tools/trace-repl/pkg/trace")]
DEPTH = ('"../../ttmp/', '"../../../../ttmp/')
SKIP_SUFFIX = (".png", ".bin", ".gz", ".elf", ".jpg", ".wasm", ".o", ".ttf", ".zst", ".pdf")


def main():
    if not DRY:
        dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO, capture_output=True, text=True).stdout
        dirty = [l for l in dirty.splitlines() if not l[3:].startswith("ttmp/")]
        assert not dirty, "commit first: " + "\n".join(dirty)
    for src, dest in MOVES:
        assert (REPO / src).is_dir() and not (REPO / dest).exists(), (src, dest)
        print(("would move" if DRY else "move"), src, "->", dest)
        if not DRY:
            (REPO / dest).parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "mv", src, dest], cwd=REPO, check=True)
    files = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True).stdout.split("\n")
    changed, depth = [], 0
    for path in files:
        if not path or path.startswith("ttmp/") or path.endswith(SKIP_SUFFIX):
            continue
        where = path   # in a dry run the files are still at their old paths
        new_path = path
        for s, d in MOVES:
            if path.startswith(s + "/"):
                new_path = d + path[len(s):]
        if not DRY:
            where = path
            new_path = path
        p = REPO / where
        if not p.is_file():
            continue
        try:
            text = p.read_text()
        except UnicodeDecodeError:
            continue
        new = text
        for old, rep, count in SPECIFIC.get(new_path, []):
            assert new.count(old) == count, (new_path, old, new.count(old))
            new = new.replace(old, rep)
        for old, rep in RULES:
            new = new.replace(old, rep)
        if new_path.startswith("tools/trace-repl/pkg/") and new_path.endswith("_test.go") and DEPTH[0] in new:
            depth += new.count(DEPTH[0])
            new = new.replace(*DEPTH)
        if new != text:
            changed.append(new_path)
            if not DRY:
                p.write_text(new)
                subprocess.run(["git", "add", path], cwd=REPO, check=True)
    assert depth == 6, f"expected six ../../ttmp globs in the pkg tests, found {depth}"
    print(("would change" if DRY else "changed"), len(changed), "files:")
    for c in changed:
        print("  ", c)


if __name__ == "__main__":
    main()
