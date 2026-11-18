"""Rank self Ir by native address. Exclude call-arc costs; verify that the sum equals Callgrind totals."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory",type=Path)
parser.add_argument("world",choices=["files","agenda"])
args=parser.parse_args()
out=args.directory
world=args.world
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(out/f"{world}.instructions.ir")==sha(out/f"{world}.ref")
raw=out/f"{world}.instructions.cg"
events=Counter()
objects={}
current_obj=""
previous=0
arc=False
for line in raw.read_text().splitlines():
    if line.startswith(("ob=", "cob=", "job=")):
        key,name=re.fullmatch(r"[cj]?ob=\((\d+)\)(?: (.*))?",line).groups()
        if name is not None: objects[key]=name
        if line.startswith("ob="): current_obj=objects[key]
    elif line.startswith(("calls=","jump=","jcnd=")):
        arc=True
    elif line.startswith("totals:"):
        total=int(line.split()[1])
    elif line and line[0] in "0123456789+-*":
        fields=line.split()
        token=fields[0]
        if token=="*": pc=previous
        elif token[0] in "+-": pc=previous+int(token,0)
        else: pc=int(token,0)
        previous=pc
        if not arc and len(fields)>2: events[current_obj,pc]+=int(fields[2])
        arc=False
assert sum(events.values())==total,(sum(events.values()),total)
exe=out/"stage1-named"
instructions={}
asm=subprocess.check_output(["objdump","-d","--no-show-raw-insn",exe],text=True)
symbol=None
for line in asm.splitlines():
    match=re.match(r"^[0-9a-f]+ <(.*)>:$",line)
    if match: symbol=match[1]
    else:
        match=re.match(r"^\s*([0-9a-f]+):\s+(.*)",line)
        if match: instructions[int(match[1],16)]=(symbol,match[2])
top=[]
for (obj,pc),count in events.most_common(25):
    fn,op=instructions[pc] if obj==str(exe) else (None,None)
    top.append(dict(image=Path(obj).name,pc=hex(pc),instructions=count,symbol=fn,assembly=op))
print(json.dumps(dict(world=world,positions=["instr","line"],event="Ir",total=total,
                      cg_sha256=sha(raw),executable_sha256=sha(exe),slir_sha256=sha(out/f"{world}.ref"),top=top),indent=2))
