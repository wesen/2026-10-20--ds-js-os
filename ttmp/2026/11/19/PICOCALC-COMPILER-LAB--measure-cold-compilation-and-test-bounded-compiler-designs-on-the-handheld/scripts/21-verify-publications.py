"""Verify each lab article and local figure from a named go-go-parc Git revision."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import quote

ARTICLES = {
    "Frontend":"ARTICLE - PicoCalc Compiler - Where Cold Typed Compilation Time Goes.md",
    "Native":"ARTICLE - PicoCalc Compiler - How a Staged Operand Stack Made Room for Editor.md",
    "Bounded":"ARTICLE - PicoCalc Compiler - When a Handheld Compiler Needs More Facts.md",
    "Incremental":"PROJECT REPORT - PicoCalc Compiler - Rebuilding Typed Native Functions After an Edit.md",
    "Examination":"ARTICLE - PicoCalc Compiler - Independently Examining Four Compiler Experiments.md",
    "Synthesis":"PROJECT REPORT - PicoCalc Compiler - Which Compiler Work Pays for Itself on a Handheld.md",
}
DAY=Path("Projects/2026/11/19")


def verify(vault,revision):
    def git(*args):
        return subprocess.check_output(["git","-C",vault,*args])
    head=git("rev-parse","--verify",revision).decode().strip()
    result={}
    for study,filename in ARTICLES.items():
        path=DAY/filename
        version=git("log","-1","--format=%H",head,"--",path).decode().strip()
        if not version: raise ValueError(f"{path} is missing from {head}")
        content=git("show",f"{head}:{path}")
        if content!=git("show",f"{version}:{path}"):
            raise ValueError(f"unexpected file history: {path}")
        body=content.decode()
        assets={}
        for relative in re.findall(r"!\[[^\]]*\]\(([^)]+)\)",body)+re.findall(r"!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]",body):
            if "://" in relative: continue
            target=DAY/relative
            data=git("show",f"{head}:{target}")
            assets[str(target)]=hashlib.sha256(data).hexdigest()
        result[study]=dict(commit=version,path=str(path),sha256=hashlib.sha256(content).hexdigest(),assets=assets,
                           url=f"https://github.com/go-go-golems/go-go-parc/blob/{version}/{quote(str(path))}")
    return {"vault_head":head,"articles":result}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vault",type=Path)
    parser.add_argument("--revision",default="origin/main")
    args=parser.parse_args()
    print(json.dumps(verify(args.vault,args.revision),indent=2))
