#!/usr/bin/env python3
"""Stage the six reviewed manuscripts as vault notes, each with the source revision."""
import argparse
import json
import re
import subprocess
from pathlib import Path

ARTICLES = [
    ("01", "ARTICLE - PicoCalc SIMD Lab - Where an Eight-Lane Compiler Should Return to Scalar Code", "Lab director"),
    ("02", "ARTICLE - PicoCalc SIMD Lab - Instruction Scheduling and Exact Narrowing for a Ray Row", "Opus High ray researcher and board operator"),
    ("03", "ARTICLE - PicoCalc SIMD Lab - Following a SIMD Decision to Executed Instructions", "Opus High evidence researcher"),
    ("04", "ARTICLE - PicoCalc SIMD Lab - Particle Layouts and Contact Scheduling", "Opus High physics researcher"),
    ("05", "ARTICLE - PicoCalc SIMD Lab - Independent Review of the Compiler Measurements", "Opus High independent reviewer"),
    ("06", "ARTICLE - PicoCalc SIMD Lab - Independent Replication of Frames and Effect Order", "Astra independent examiner"),
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="empty staging directory for new vault articles")
    args = parser.parse_args()
    ticket = Path(__file__).resolve().parents[2]
    repo = Path(subprocess.check_output(["git","rev-parse","--show-toplevel"], cwd=ticket, text=True).strip())
    args.directory.mkdir(parents=True, exist_ok=True)
    for key, filename, author in ARTICLES:
        sources = list((ticket/"analysis").glob(key+"-*.md"))
        if len(sources) != 1:
            raise ValueError(f"expected one reviewed article {key}, found {sources}")
        src = sources[0]
        relative = src.relative_to(repo).as_posix()
        revision = subprocess.check_output(["git","log","-1","--format=%H","--",relative],
                                           cwd=repo,text=True).strip()
        if not revision:
            raise ValueError("commit the reviewed source first: " + relative)
        committed = subprocess.check_output(["git","show",revision+":"+relative],cwd=repo)
        if committed != src.read_bytes():
            raise ValueError("article differs from reviewed commit: " + relative)
        body = src.read_text().split("---\n", 2)[2].strip()
        # Sources also run inside docmgr. Point ticket-relative links back at the
        # research checkout when this copy is placed in a different repository.
        figure_source = ticket/"various/director/packet-boundaries.png"
        figure_relative = "_assets/picocalc-simd-lab-packet-boundaries.png"
        def relocate_link(match):
            target = match.group(1).strip("<>")
            if target.startswith(("/", "#")) or "://" in target or target.startswith("mailto:"):
                return match.group()
            path, separator, anchor = target.partition("#")
            resolved = (src.parent / path).resolve(strict=True)
            resolved.relative_to(repo)
            if resolved == figure_source.resolve():
                figure_out = args.directory/figure_relative
                figure_out.parent.mkdir(exist_ok=True)
                if figure_out.exists() and figure_out.read_bytes() != figure_source.read_bytes():
                    raise ValueError("existing figure differs: " + str(figure_out))
                figure_out.write_bytes(figure_source.read_bytes())
                return "]("+figure_relative+")"
            address = str(resolved) + (separator + anchor if separator else "")
            return "](" + ("<" + address + ">" if " " in address else address) + ")"
        body = re.sub(r"\]\(([^)\n]+)\)", relocate_link, body)
        title = next(line[2:].strip() for line in body.splitlines() if line.startswith("# "))
        front = ["---", "title: "+json.dumps(title,ensure_ascii=False),
                 "tags: [project, compiler, llvm, picocalc, simd, research]",
                 "aliases: []", "type: article", "status: complete", "created: 2026-11-21",
                 "repo: "+str(repo), "ticket: PICOCALC-SIMD-LAB",
                 "research_author: "+json.dumps(author),
                 "source_path: "+relative, "source_revision: "+revision, "---"]
        notes = "\n".join("- [["+other+"]]" for _,other,_ in ARTICLES if other!=filename)
        article = "\n".join(front)+"\n\n"+body+"\n\n## Companion studies\n\n"+notes+"\n"
        target = args.directory/(filename+".md")
        if target.exists() and target.read_text()!=article:
            raise ValueError("existing staging file differs: "+str(target))
        target.write_text(article)
        print(target.name, len(body.split()), revision[:10])

if __name__ == "__main__":
    main()
