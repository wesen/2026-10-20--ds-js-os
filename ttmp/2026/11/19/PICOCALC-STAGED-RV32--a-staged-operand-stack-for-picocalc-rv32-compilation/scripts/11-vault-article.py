#!/usr/bin/env python3
"""Render the native compiler article and its board image for the vault."""
import argparse
from pathlib import Path
import re

TICKET = Path(__file__).resolve().parent.parent
REPO = TICKET.parents[4]
NAME = "ARTICLE - PicoCalc Compiler - How a Staged Operand Stack Made Room for Editor.md"
HEADER = """---
title: How a staged operand stack made room for PicoCalc Editor
aliases:
  - PicoCalc staged native RV32 code generation
  - PicoCalc Editor 80 KiB executable slot
tags:
  - article
  - picocalc
  - risc-v
  - compiler-construction
status: complete
type: article
created: 2026-11-19
repo: /home/manuel/code/wesen/2026-10-20--ds-js-os
---

"""
ASSET = "picocalc-staged-editor-64k-preview.png"


def render(folder):
    source, = (TICKET / "analysis").glob("02-*.md")
    body = source.read_text().split("---\n", 2)[-1].lstrip()

    def reference(match):
        image, label, target = match.groups()
        if target.startswith(("https://", "http://", "#")):
            return match.group()
        path = (source.parent / target).resolve(strict=True)
        if image:
            assert path.name == "editor-small-slot-preview.png", path
            assets = folder / "_assets"
            assets.mkdir(exist_ok=True)
            asset = assets / ASSET
            data = path.read_bytes()
            if asset.exists():
                assert asset.read_bytes() == data, asset
            else:
                asset.write_bytes(data)
            return f"![{label}](_assets/{ASSET})"
        return f"{label} (`{path.relative_to(REPO)}`)"

    body = re.sub(r"(!?)\[([^\]]+)\]\(([^)]+)\)", reference, body)
    note = folder / NAME
    with note.open("x") as handle:
        handle.write(HEADER + body.rstrip() + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    render(args.output)
