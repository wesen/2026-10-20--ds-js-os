"""Resolve each timer-sampled RIP to its ELF symbol, retaining uncovered samples in the denominator."""
import argparse
from bisect import bisect_right
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("executable",type=Path)
parser.add_argument("samples",type=Path)
args = parser.parse_args()
names = subprocess.check_output(["nm","-nS","--defined-only",args.executable],text=True)
symbols = sorted((int(addr,16),int(size,16),name) for addr,size,name in
                 re.findall(r"^([0-9a-f]+) ([0-9a-f]+) [tTwW] (.*)$",names,re.M))
addresses = [s[0] for s in symbols]
counts, pcs = Counter(), Counter()
for (pc,) in struct.iter_unpack("<Q", args.samples.read_bytes()):
    i = bisect_right(addresses,pc) - 1
    addr,size,name = symbols[i]
    counts[name if i >= 0 and pc < addr+size else "[outside named executable functions]"] += 1
    pcs[pc] += 1
total = sum(counts.values())
if not total:
    raise ValueError("no samples")
print(json.dumps(dict(event="ITIMER_PROF", requested_period_us=1000, samples=total,
                     executable_sha256=hashlib.sha256(args.executable.read_bytes()).hexdigest(),
                     top_symbols=[dict(symbol=name,samples=n,percent=100*n/total) for name,n in counts.most_common(25)],
                     top_pcs=[dict(pc=hex(pc),samples=n) for pc,n in pcs.most_common(20)]),indent=2))
