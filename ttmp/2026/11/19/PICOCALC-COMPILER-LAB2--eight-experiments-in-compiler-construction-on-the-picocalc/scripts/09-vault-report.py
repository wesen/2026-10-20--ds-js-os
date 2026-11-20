"""Copy a completed ticket report, with working references, into a new Obsidian note."""
import argparse
import re
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[6]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source",type=Path);parser.add_argument("directory",type=Path)
    parser.add_argument("name");parser.add_argument("--alias",required=True)
    args=parser.parse_args()
    src=args.source.resolve()
    body=src.read_text().split("---\n",2)[-1].strip()
    title=next(line[2:] for line in body.splitlines() if line.startswith("# "))
    if not args.name.endswith(".md") or Path(args.name).name!=args.name: raise ValueError(args.name)
    out=args.directory.resolve()
    target=out/args.name
    if target.exists(): raise FileExistsError(target)
    out.mkdir(parents=True,exist_ok=True)
    def reference(match):
        image,label,link=match.groups()
        if link.startswith(("https://","http://","#")): return match.group()
        linked=(src.parent/link).resolve()
        if not linked.exists(): raise FileNotFoundError(linked)
        if image:
            asset=out/"_assets"/linked.name
            asset.parent.mkdir(exist_ok=True)
            if asset.exists() and asset.read_bytes()!=linked.read_bytes(): raise FileExistsError(asset)
            if not asset.exists(): shutil.copyfile(linked,asset)
            return f"![{label}](_assets/{asset.name})"
        return f"{label} (`{linked.relative_to(ROOT)}`)"
    body=re.sub(r"(!?)\[([^\]]+)\]\(([^)]+)\)",reference,body)
    header=f"""---
title: "{title}"
aliases:
  - "{args.alias}"
tags:
  - project-report
  - compiler-construction
  - picocalc
  - esp32-p4
created: 2026-11-19
type: project-report
status: complete
---

"""
    with target.open("x") as f: f.write(header+body+"\n")
    print(target)


if __name__=="__main__": main()
