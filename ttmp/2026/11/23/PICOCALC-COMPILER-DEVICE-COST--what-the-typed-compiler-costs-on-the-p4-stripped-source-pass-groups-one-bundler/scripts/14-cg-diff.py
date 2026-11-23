#!/usr/bin/env python3
"""Per-function differences between two callgrind outputs (self cost, one event), largest first.

usage: 14-cg-diff.py A.cg B.cg [EVENT] [N]      EVENT: Ir (default), DLmr, I1mr, ...
"""
import re
import subprocess
import sys


def costs(path, event):
    text = subprocess.run(["callgrind_annotate", "--inclusive=no", f"--show={event}", "--threshold=100", path],
                          capture_output=True, text=True, check=True).stdout
    # Only the flat profile: the lines after the first "file:function" header, up to the next blank line.
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.rstrip().endswith("file:function")) + 2
    out = {}
    for line in lines[start:]:
        if not line.strip():
            break
        m = re.match(r"^\s*([\d,]+)\s+\([^)]*\)\s+(.*)$", line)
        if m:
            name = re.sub(r" \[[^]]*\]$", "", m[2])
            name = name.split(":", 1)[-1] if ":" in name else name
            out[name] = out.get(name, 0) + int(m[1].replace(",", ""))
    return out


a_path, b_path = sys.argv[1], sys.argv[2]
event = sys.argv[3] if len(sys.argv) > 3 else "Ir"
n = int(sys.argv[4]) if len(sys.argv) > 4 else 20
a, b = costs(a_path, event), costs(b_path, event)
print(f"{event}: A {sum(a.values()):,} B {sum(b.values()):,} B-A {sum(b.values()) - sum(a.values()):+,}")
for name in sorted(set(a) | set(b), key=lambda k: -abs(b.get(k, 0) - a.get(k, 0)))[:n]:
    print(f"{b.get(name, 0) - a.get(name, 0):+12,} {a.get(name, 0):14,} {b.get(name, 0):14,}  {name}")
