"""Render the supervisor chapter as a self-contained vault article with private repository file references."""
import argparse
from pathlib import Path
import re
import shutil

HERE = Path(__file__).resolve().parent
TICKET = HERE.parent
REPO = HERE.parents[5]
NAME = "PROJECT REPORT - PicoCalc Compiler - Which Compiler Work Pays for Itself on a Handheld.md"
HEADER = """---
title: Which compiler work pays for itself on a handheld?
aliases:
  - PicoCalc four-study compiler laboratory
tags:
  - project-report
  - picocalc
  - compiler-construction
  - incremental-compilation
created: 2026-11-19
type: project-report
status: complete
---

"""
ASSETS = {
    "compiler-design-comparison.png": "picocalc-four-compiler-experiments.png",
    "editor-small-slot-preview.png": "picocalc-staged-editor-64k-preview.png",
}


def render(folder):
    source, = (TICKET / "analysis").glob("01-*.md")
    body = source.read_text().split("---\n", 2)[-1].lstrip()
    def local(match):
        mark, label, target = match.groups()
        if target.startswith(("https://", "http://", "#")):
            return match.group()
        path = (source.parent / target).resolve(strict=True)
        if mark:
            asset = ASSETS[path.name]
            (folder / "_assets").mkdir(exist_ok=True)
            shutil.copyfile(path, folder / "_assets" / asset)
            return f"![{label}](_assets/{asset})"
        rel = path.relative_to(REPO)
        return f"{label} (`{rel}`)"
    body = re.sub(r"(!?)\[([^\]]+)\]\(([^)]+)\)", local, body)
    (folder / NAME).write_text(HEADER + body.rstrip() + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="disposable output directory or dated vault directory")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    render(args.output)
