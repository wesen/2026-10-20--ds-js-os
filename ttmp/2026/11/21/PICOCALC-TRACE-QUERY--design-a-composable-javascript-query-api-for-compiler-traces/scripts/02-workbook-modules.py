"""Materialize the workbook as syntax-checkable client modules, or verify them."""
import argparse
import re
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--write", action="store_true")
opts = parser.parse_args()
scripts = Path(__file__).resolve().parent
workbook, = (scripts.parent / "design-doc").glob("02-*.md")
entries = re.findall(r"^## (\d{2})\. ([^\n]+)\n\n```js\n(.*?)\n```", workbook.read_text(), re.M | re.S)
assert [int(n) for n,_,_ in entries] == list(range(1,27))
out = scripts / "examples"
if opts.write:
    out.mkdir(exist_ok=True)
files = []
for n,title,body in entries:
    slug = re.sub(r"[^a-z0-9]+","-",title.lower()).strip("-")
    file = out / f"{n}-{slug}.mjs"
    text = f"// Proposed API example {n}. {title}\n" + (
        "export default function example({ q, a, run, row, middle, header, profiles, session }) {\n"
        + "\n".join("  "+line if line else "" for line in body.splitlines())
        + "\n}\n"
    )
    if opts.write:
        file.write_text(text)
    assert file.read_text() == text, file
    subprocess.run(["node","--check",file],check=True)
    files.append(file)
assert sorted(out.glob("*.mjs")) == sorted(files)
print(f"{len(files)} example modules match the workbook and pass node --check")
