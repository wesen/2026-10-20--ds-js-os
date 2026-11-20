"""Prepare the supervisor's reader bundle or the vault article and its images."""
import argparse
from pathlib import Path
import shutil
from urllib.parse import quote

ticket = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("format", choices=["reader","vault"])
p.add_argument("out", type=Path, help="new scratch directory")
p.add_argument("--vault", type=Path, help="go-go-parc clone for checking published companion articles")
a = p.parse_args()
out = a.out.resolve()
out.mkdir(parents=True, exist_ok=False)

def body(pattern):
    item, = ticket.glob(pattern)
    return item.read_text().split("\n---\n", 1)[1].strip() + "\n"

text = body("analysis/01*.md")
assets = {
    "p4-compiler-trials.png": "picocalc-rv32-independent-trials.png",
    "p4-branch-editor-preview.png": "picocalc-rv32-branch-editor-preview.png",
}
for src, name in assets.items():
    path = ticket / "various" / src
    ref = "../various/" + src
    assert path.exists() and ref in text
    if a.format == "vault":
        (out / "_assets").mkdir(exist_ok=True)
        shutil.copyfile(path, out / "_assets" / name)
        text = text.replace(ref, "_assets/" + name)
    else:
        text = text.replace(ref,str(path))

if a.format == "reader":
    (out / "01-design.md").write_text(body("design-doc/01*.md"))
    (out / "02-study.md").write_text(text)
else:
    if not a.vault:
        p.error("--vault is required for article publication")
    articles = a.vault / "Projects/2026/11/19"
    prefix = "PROJECT REPORT - PicoCalc Compiler - "
    companions = ["Fusing RV32 Comparisons and Branches", "Compact Native Output and Peak Allocation",
                  "Independent Examination of RV32 Branches and Output Storage"]
    text += "\n## Companion studies\n\n"
    for title in companions:
        name = prefix + title + ".md"
        assert (articles / name).is_file(), name
        text += f"- [{title}]({quote(name)})\n"
    metadata = """---
title: How a handheld compiler spends time and memory
type: project-report
created: 2026-11-19
status: complete
tags: [compiler, picocalc, riscv, performance, research]
ticket: PICOCALC-RV32-STUDIES
repo: /home/manuel/code/wesen/2026-10-20--ds-js-os
---

"""
    name = prefix + "How a Handheld Compiler Spends Time and Memory.md"
    (out / name).write_text(metadata + text)
