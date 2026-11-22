#!/usr/bin/env python3
"""Phase H: copy the two current guides into docs/ with their paths in the new layout (the ticket copies stay).

usage: python3 10-promote-guides.py        (runs once; refuses to overwrite)

- RAY-PARITY design-doc/01 (how the Typed compiler reaches C on the ray tracer) -> docs/typed-compiler-and-the-ray-tracer.md
- CANDELA-GALLERY design-doc/01 (Candela's presets on the screen)              -> docs/candela-on-the-p4.md
Only path names change; each copy starts with a note naming its source. The guides' prose describes the state of
the work when they were written; measurements and ticket script names stay as recorded.
"""
import glob, re, subprocess
from pathlib import Path

REPO = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
MAP = [
    ("picocalc-os/compiler/typed-", "compiler/typed/typed-"), ("picocalc-os/compiler/rv32", "compiler/typed/rv32"),
    ("picocalc-os/compiler/raytrace-material.js", "apps/typed/raytrace/link-material.js"),
    ("picocalc-os/compiler/raytrace.js", "apps/typed/raytrace/link.js"), ("picocalc-os/compiler/candela.js", "apps/typed/candela/link.js"),
    ("picocalc-os/compiler/mobile-painter.js", "apps/typed/chess/link-painter.js"),
    ("picocalc-os/tools/typed-ray-profile.mjs", "bench/host/ray-profile.mjs"), ("picocalc-os/tools/rv32-interp.js", "bench/host/rv32-interp.js"),
    ("picocalc-os/tools/typed-ray-bench.js", "bench/host/typed-ray-bench.js"), ("picocalc-os/tools/typed-inspect", "compiler/typed/tools/typed-inspect"),
    ("picocalc-os/tools/candela-bc.c", "tools/gen/candela/candela-bc.c"), ("picocalc-os/tools/candela-stage.py", "tools/gen/candela/candela-stage.py"),
    ("picocalc-os/tests/typed-", "tests/compiler/typed-"),
    ("picocalc-os/worlds/candela-world", "apps/js/worlds/candela-world"), ("picocalc-os/worlds/candela-gallery", "apps/js/worlds/candela-gallery"),
    ("picocalc-os/worlds/", "apps/typed/"), ("picocalc-os/js/", "apps/js/picocalc/"), ("picocalc-os/", "firmware/"),
    # Paths written relative to the old firmware tree, inside code spans.
    ("`compiler/typed-", "`compiler/typed/typed-"), ("`compiler/rv32/", "`compiler/typed/rv32/"),
    ("`tools/typed-ray-profile.mjs", "`bench/host/ray-profile.mjs"), ("`tools/rv32-interp.js", "`bench/host/rv32-interp.js"),
    ("`tools/typed-ray-bench.js", "`bench/host/typed-ray-bench.js"), ("`worlds/candela-world", "`apps/js/worlds/candela-world"),
    ("`worlds/candela-gallery", "`apps/js/worlds/candela-gallery"), ("`worlds/", "`apps/typed/"), ("`js/system/", "`apps/js/picocalc/system/"),
    ("`cji/", "`compiler/cji/"),
]
GUIDES = [
    ("21", "PICOCALC-RAY-PARITY", "design-doc/01-how-the-typed-compiler-reaches-c-on-the-ray-tracer-an-intern-guide.md", "typed-compiler-and-the-ray-tracer.md"),
    ("22", "PICOCALC-CANDELA-GALLERY", "design-doc/01-render-candela-s-presets-progressively-on-the-picocalc-s-screen.md", "candela-on-the-p4.md"),
]
for day, ticket, rel, name in GUIDES:
    src = Path(glob.glob(str(REPO / "ttmp/2026/11" / day / (ticket + "--*")))[0]) / rel
    dest = REPO / "docs" / name
    assert not dest.exists(), dest
    text = src.read_text()
    front, body = "", text
    if text.startswith("---\n"):
        end = text.index("\n---\n", 4) + 5
        front, body = text[:end], text[end:]
    for old, new in MAP:
        body = body.replace(old, new)
    note = (f"> This guide was written in {ticket} and is kept current here; the ticket copy "
            f"(`{src.relative_to(REPO)}`) is the historical record. Paths are those of the repository today; "
            "measurements, commits and ticket script names are as recorded when it was written. "
            "The ticket scripts it names have promoted, parameterized versions in `bench/` (see `docs/measuring.md`).\n\n")
    # Keep the first heading first.
    m = re.search(r"^# .*\n", body, re.M)
    body = body[:m.end()] + "\n" + note + body[m.end():] if m else note + body
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(body)   # without docmgr frontmatter: docs/ is not a ticket
    print(src.name, "->", dest.relative_to(REPO), len(body.split()), "words")
