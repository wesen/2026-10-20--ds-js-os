#!/usr/bin/env python3
"""Render a completed compiler article with portable source references."""
import argparse
from pathlib import Path
import re

REPO = Path(__file__).resolve().parents[6]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("article", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.article.resolve()
    body = source.read_text().split("---\n", 2)[-1].lstrip()
    title = body.splitlines()[0].removeprefix("# ")
    def reference(match):
        label, link = match.groups()
        if link.startswith(("https://", "http://", "#")):
            return match.group()
        path, _, fragment = link.partition("#")
        relative = (source.parent / path).resolve(strict=True).relative_to(REPO)
        shown = str(relative) + ("#" + fragment if fragment else "")
        return f"{label} (`{shown}`)"
    body = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", reference, body)
    header = f"""---
title: "{title}"
aliases:
  - "{title}"
tags:
  - article
  - picocalc
  - risc-v
  - compiler-construction
status: complete
type: article
created: 2026-11-19
repo: {REPO}
---

"""
    with args.output.open("x") as output:
        output.write(header + body.rstrip() + "\n")
