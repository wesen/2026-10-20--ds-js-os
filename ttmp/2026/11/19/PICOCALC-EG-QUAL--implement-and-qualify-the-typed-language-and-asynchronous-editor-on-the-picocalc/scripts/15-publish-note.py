"""Stage one dated, append-only Obsidian article and its figures using the lab's link resolver."""
import argparse
import datetime
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE=Path(__file__).resolve().parent
HELPER, = HERE.parent.parent.glob("PICOCALC-COMPILER-LAB2--*/scripts/09-vault-report.py")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("source",type=Path)
    p.add_argument("directory",type=Path)
    p.add_argument("name")
    p.add_argument("--alias",required=True)
    args=p.parse_args()
    date=datetime.date.fromisoformat("-".join(args.directory.parts[-3:]))
    target=args.directory/args.name
    if not args.name.endswith(".md") or Path(args.name).name!=args.name or target.exists():
        raise ValueError(f"expected a new note filename: {target}")
    with tempfile.TemporaryDirectory() as scratch:
        subprocess.run([sys.executable,HELPER,args.source,scratch,args.name,"--alias",args.alias],check=True)
        root=Path(scratch)
        note=(root/args.name).read_text().replace("created: 2026-11-19\n","created: "+date.isoformat()+"\n",1)
        assets={}
        for src in (root/"_assets").glob("*"):
            dst=args.directory/"_assets"/src.name
            if dst.exists() and dst.read_bytes()!=src.read_bytes(): raise ValueError(f"unrelated figure at {dst}")
            assets[src]=dst
        args.directory.mkdir(parents=True,exist_ok=True)
        for src,dst in assets.items():
            dst.parent.mkdir(exist_ok=True)
            if not dst.exists(): shutil.copyfile(src,dst)
        with target.open("x") as file: file.write(note)
    print(target)


if __name__=="__main__": main()
