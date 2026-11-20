"""Append three reviewed ticket articles and their two figures to go-go-parc."""
import argparse
from pathlib import Path
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("vault",type=Path)
args=parser.parse_args()
ticket=Path(__file__).resolve().parent.parent
day=args.vault/"Projects/2026/11/20"
assets=day/"_assets"
assets.mkdir(parents=True,exist_ok=True)
paths=[]
def append(path, data):
    if path.exists() and path.read_bytes()!=data:
        raise ValueError(f"existing vault content differs: {path}")
    if not path.exists():
        path.write_bytes(data)
    paths.append(str(path.relative_to(args.vault)))
for src in ["system-worlds","system-buses"]:
    append(assets/("p4-compositor-"+src+".png"),(ticket/"various"/(src+".png")).read_bytes())
for p in sorted((ticket/"analysis").glob("0[123]-*.md")):
    body=p.read_text().split("\n---\n",1)[1].strip()
    title=next(line[2:].strip() for line in body.splitlines() if line.startswith("# "))
    for src in ["system-worlds","system-buses"]:
        body=body.replace("../various/"+src+".png","_assets/p4-compositor-"+src+".png")
    name="ARTICLE - PicoCalc - "+title.rstrip("?").replace(":"," -")+".md"
    header=("---\ntitle: '"+title.replace("'","''")+"'\naliases: []\ntags: [article, picocalc, compositor, embedded]\n"
            "status: published\ntype: article\ncreated: 2026-11-20\n"
            "repo: /home/manuel/code/wesen/2026-10-20--ds-js-os\n---\n\n")
    append(day/name,(header+body+"\n").encode())
git=["git","-C",str(args.vault)]
subprocess.run(git+["add","--",*paths],check=True)
subprocess.run(git+["diff","--cached","--check","--",*paths],check=True)
subprocess.run(git+["commit","--only","-m","Publish the PicoCalc compositor investigation and physical qualification","--",*paths],check=True)
subprocess.run(git+["push","origin","HEAD:main"],check=True)
