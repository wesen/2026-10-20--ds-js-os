"""List verified Obsidian research reports added since the preceding compiler wave."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from urllib.parse import quote
PREVIOUS="5e62fa498c37bf5480f2f6c1cf338fc918166916"


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("vault",type=Path)
    p.add_argument("out",type=Path)
    p.add_argument("--tip",default="origin/main")
    args=p.parse_args()
    def git(*parts):
        return subprocess.check_output(["git","-C",args.vault,*parts])
    tip=git("rev-parse",args.tip).decode().strip()
    paths=git("diff","--name-only","--diff-filter=A",PREVIOUS,tip,"--","Projects/2026/11/19/").decode().splitlines()
    notes=[]
    for path in sorted(paths):
        if not path.endswith(".md") or "PicoCalc Compiler - " not in Path(path).name:
            continue
        commit=git("log","-1","--format=%H",tip,"--",path).decode().strip()
        raw=git("show",commit+":"+path)
        title=next(line[2:] for line in raw.decode().splitlines() if line.startswith("# "))
        notes.append(dict(title=title, path=path,commit=commit,sha256=hashlib.sha256(raw).hexdigest(),
                          url="https://github.com/go-go-golems/go-go-parc/blob/"+commit+"/"+quote(path)))
    args.out.write_text(json.dumps(dict(previous=PREVIOUS,tip=tip,reports=notes),indent=2)+"\n")
    print(f"{len(notes)} verified reports at {tip}")


if __name__=="__main__": main()
