"""Checked file splits for PICOCALC-SPLIT-FILES (the model is PICOCALC-REPO-LAYOUT's move scripts).

A split names its source, the files it becomes, and which line ranges of the source each one takes. The library
asserts that every line of the source goes to exactly one place (a part, or a named list of lines that the edits
re-create elsewhere), that the tree is clean and that no part exists yet unless it is the source itself. Edits are
(old, new, count) replacements with asserted counts, applied after the parts are written. --dry-run prints the plan.

    from splitlib import Part, split
    split("pkg/x.js", [Part("pkg/x/a.js", [(1, 40)]), Part("pkg/x/b.js", [(41, 90)], head="// b\n")],
          moved=[(91, 91)], edits={"pkg/x.go": [("x.js", "x/*.js", 1)]})
"""
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())


@dataclass
class Part:
    path: str
    ranges: list            # [(first, last)], 1-based, inclusive, in output order
    head: str = ""          # text written before the ranges
    tail: str = ""          # text written after them
    between: dict = field(default_factory=dict)   # {range index: text written before that range}


def lines_of(path):
    return (REPO / path).read_text().splitlines(keepends=True)


def revert(source, parts, edits):
    """--revert: undo an applied, uncommitted split (while its fix-ups are being worked out): the source and the edited
    files come back from HEAD, the new parts (and only they) are removed."""
    new = [p.path for p in parts if p.path != source]
    tracked = subprocess.run(["git", "ls-tree", "--name-only", "HEAD", "--", *new], cwd=REPO, capture_output=True,
                             text=True, check=True).stdout.split()
    assert not tracked, f"parts already committed, not reverting: {tracked}"
    subprocess.run(["git", "reset", "-q", "--", source, *new, *edits], cwd=REPO, check=True)
    subprocess.run(["git", "checkout", "HEAD", "--", source, *edits], cwd=REPO, check=True)
    for path in new:
        if (REPO / path).exists():
            (REPO / path).unlink()
            print("removed", path)
    print("restored", source, *edits)


def split(source, parts, moved=(), edits=None, dry=None, post=()):
    if sys.argv[1:] == ["--revert"]:
        return revert(source, parts, list(edits or {}))
    dry = sys.argv[1:] == ["--dry-run"] if dry is None else dry
    assert sys.argv[1:] in ([], ["--dry-run"]), "usage: SCRIPT [--dry-run | --revert]"
    if not dry:
        dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO,
                               capture_output=True, text=True).stdout
        assert not dirty, "commit first:\n" + dirty
    src = lines_of(source)
    n = len(src)
    used = [0] * (n + 1)
    for p in parts:
        for a, b in p.ranges:
            assert 1 <= a <= b <= n, (p.path, a, b, n)
            for i in range(a, b + 1):
                used[i] += 1
    for a, b in moved:
        for i in range(a, b + 1):
            used[i] += 1
    bad = [i for i in range(1, n + 1) if used[i] != 1]
    assert not bad, f"{source}: lines used {[(i, used[i]) for i in bad[:10]]} times (want exactly once)"
    for p in parts:
        assert p.path == source or not (REPO / p.path).exists(), f"{p.path} exists"
    texts = {}
    for p in parts:
        out = [p.head]
        for k, (a, b) in enumerate(p.ranges):
            out.append(p.between.get(k, ""))
            out.extend(src[a - 1:b])
        out.append(p.tail)
        texts[p.path] = "".join(out)
    for path, t in texts.items():
        print(f"{'would write' if dry else 'wrote'} {path}: {t.count(chr(10))} lines")
    if moved:
        print("lines moved by the edits:", ", ".join(f"{a}-{b}" for a, b in moved))
    if dry:
        return
    for path, t in texts.items():
        (REPO / path).parent.mkdir(parents=True, exist_ok=True)
        (REPO / path).write_text(t)
    if source not in texts:
        subprocess.run(["git", "rm", "-q", source], cwd=REPO, check=True)
    for path, reps in (edits or {}).items():
        p = REPO / path
        text = p.read_text()
        for old, new, count in reps:
            found = text.count(old)
            assert found == count, (path, old[:60], found, count)
            text = text.replace(old, new)
        p.write_text(text)
        print("edited", path, len(reps), "replacements")
    for cmd in post:   # e.g. goimports on the parts: imports are re-derived, never hand-copied
        subprocess.run(cmd, cwd=REPO, check=True)
        print("ran", " ".join(cmd))
    subprocess.run(["git", "add", *texts.keys(), *(edits or {}).keys()], cwd=REPO, check=True)


def go_split(source, keep, parts, edits=None):
    """Split a Go file: the source keeps the line ranges `keep`; each of `parts` ({path: (comment, ranges)}) gets the
    package clause, the source's whole import block and its ranges; goimports then drops the imports a file does not
    use (it never has to guess one)."""
    src = lines_of(source)
    pkg = next(l for l in src if l.startswith("package "))
    a = next(i for i, l in enumerate(src) if l.startswith("import ("))
    b = next(i for i in range(a, len(src)) if src[i] == ")\n")
    imports = "".join(src[a:b + 1])
    out = [Part(source, keep)]
    for path, (comment, ranges) in parts.items():
        out.append(Part(path, ranges, head=f"{pkg}\n{comment}\n\n{imports}\n"))
    files = [source, *parts.keys()]
    split(source, out, edits=edits, post=[["goimports", "-w", *files], ["gofmt", "-l", "-w", *files]])
