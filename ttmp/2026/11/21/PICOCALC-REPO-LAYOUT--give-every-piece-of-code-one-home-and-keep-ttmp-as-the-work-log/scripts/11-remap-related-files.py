#!/usr/bin/env python3
"""Phase I: point the tickets' RelatedFiles at the files' current paths.

usage: python3 11-remap-related-files.py [--dry-run]

After Phases C, E and D, 451 RelatedFiles entries named paths that moved (docmgr doctor: missing_related_file). Only
frontmatter "Path:" values change, and only when the remapped file exists; document bodies are history and keep the
paths they were written with. Absolute and repo:// paths keep their form.
"""
import re, subprocess, sys
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
DRY = sys.argv[1:] == ["--dry-run"]
RULES = [
    ("picocalc-os/compiler/typed-", "compiler/typed/typed-"), ("picocalc-os/compiler/rv32/", "compiler/typed/rv32/"),
    ("picocalc-os/compiler/raytrace-material.js", "apps/typed/raytrace/link-material.js"),
    ("picocalc-os/compiler/raytrace.js", "apps/typed/raytrace/link.js"), ("picocalc-os/compiler/candela.js", "apps/typed/candela/link.js"),
    ("picocalc-os/compiler/mobile-painter.js", "apps/typed/chess/link-painter.js"),
    ("picocalc-os/tools/typed-ray-profile.mjs", "bench/host/ray-profile.mjs"), ("picocalc-os/tools/rv32-interp.js", "bench/host/rv32-interp.js"),
    ("picocalc-os/tools/typed-ray-bench.js", "bench/host/typed-ray-bench.js"), ("picocalc-os/tools/typed-inspect", "compiler/typed/tools/typed-inspect"),
    ("picocalc-os/tools/candela-bc.c", "tools/gen/candela/candela-bc.c"), ("picocalc-os/tools/candela-stage.py", "tools/gen/candela/candela-stage.py"),
    ("picocalc-os/tests/typed-", "tests/compiler/typed-"),
    ("picocalc-os/worlds/candela-world", "apps/js/worlds/candela-world"), ("picocalc-os/worlds/candela-gallery", "apps/js/worlds/candela-gallery"),
    ("picocalc-os/worlds/", "apps/typed/"), ("picocalc-os/js-papers3", "apps/js/papers3"), ("picocalc-os/js/", "apps/js/picocalc/"),
    ("picocalc-os/scripts-agent", "apps/tours/agent"), ("picocalc-os/scripts-papers3", "apps/tours/papers3"),
    ("picocalc-os/scripts/", "apps/tours/picocalc/"), ("picocalc-os/", "firmware/"),
    ("cji/tools/rv32/emu.c", "bench/emu/emu.c"), ("cji/", "compiler/cji/"),
]
PATH_LINE = re.compile(r"^(\s*-\s*Path:\s*)(\S.*?)\s*$")


def remap(value):
    # Three forms: repository-relative, absolute, and docmgr's repo://PATH.
    root = str(REPO) + "/"
    if value.startswith("repo://"):
        root, value = "repo://", str(REPO) + "/" + value[len("repo://"):]
    absolute = value.startswith(str(REPO) + "/")
    rel = value[len(str(REPO)) + 1:] if absolute else value
    for old, new in RULES:
        if rel.startswith(old) or rel == old.rstrip("/"):
            moved = new + rel[len(old):]
            if (REPO / moved).exists():
                return (root + moved) if absolute else moved
            return None
    return None


changed = files = 0
for doc in sorted((REPO / "ttmp").rglob("*.md")):
    text = doc.read_text()
    if not text.startswith("---\n"):
        continue
    end = text.find("\n---\n", 4)
    if end < 0:
        continue
    head, rest = text[:end], text[end:]
    out, n = [], 0
    for line in head.split("\n"):
        m = PATH_LINE.match(line)
        if m:
            value = m.group(2).strip("'\"")
            plain = value[len("repo://"):] if value.startswith("repo://") else value
            if not (REPO / plain).exists() and not Path(plain).exists():
                new = remap(value)
                if new:
                    line = m.group(1) + new
                    n += 1
        out.append(line)
    if n:
        files += 1
        changed += n
        if not DRY:
            doc.write_text("\n".join(out) + rest)
print(("would remap" if DRY else "remapped"), changed, "entries in", files, "documents")
