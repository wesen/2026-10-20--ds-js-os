#!/usr/bin/env python3
"""Stage the four reviewed manuscripts as vault notes, each with the source revision."""
import argparse
import json
import subprocess
from pathlib import Path

ARTICLES = [
    ("02", "ARTICLE - PicoCalc - Evidence for the Next Typed Compiler Optimization", "Opus High evidence researcher"),
    ("03", "ARTICLE - PicoCalc - Persistent Compiler Investigations in Goja", "Opus High runtime researcher"),
    ("04", "ARTICLE - PicoCalc - Blind Compiler Engineers Evaluating a Research API", "Opus High usability researcher"),
    ("05", "ARTICLE - PicoCalc - Designing and Validating Compiler Optimizations with a Trace REPL", "Lab director"),
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="empty staging directory for new vault articles")
    args = parser.parse_args()
    ticket = Path(__file__).resolve().parent.parent
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
        title = next(line[2:].strip() for line in body.splitlines() if line.startswith("# "))
        front = ["---", "title: "+json.dumps(title,ensure_ascii=False),
                 "tags: [project, compiler, llvm, picocalc, research]",
                 "type: article", "status: active", "created: 2026-11-21",
                 "repo: "+str(repo), "ticket: PICOCALC-TRACE-REPL",
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
