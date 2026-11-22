#!/usr/bin/env python3
"""08-counts-table.py: the interpreter's instructions per camera sample, as an arm x scene table.

usage: python3 -I 08-counts-table.py COUNTS.jsonl [--md]

Each cell is instructions per sample and the first four hex digits of the frame digest (equal digests mean
bit-identical frames). The last columns are the arm's library .text (and .iram1) bytes."""
import json
import sys

rows = [json.loads(line) for line in open(sys.argv[1])]
md = "--md" in sys.argv
scenes = []
arms = []
for r in rows:
    if r["scene"] not in scenes:
        scenes.append(r["scene"])
    if r["arm"] not in arms:
        arms.append(r["arm"])
t = {(r["arm"], r["scene"]): r for r in rows}


def cell(a, s):
    r = t.get((a, s))
    if not r or "perSample" not in r:
        return "error"
    return f"{r['perSample']:,.0f} ({r['digest'][:4]})"


head = ["arm", *scenes, ".text", ".iram1"]
lines = []
for a in arms:
    size = t[(a, scenes[0])].get("armBytes", {})
    lines.append([a, *(cell(a, s) for s in scenes), f"{size.get('text', 0):,}", f"{size.get('iram', 0):,}"])
if md:
    print("| " + " | ".join(head) + " |")
    print("|" + "---|" * len(head))
    for line in lines:
        print("| " + " | ".join(line) + " |")
else:
    w = [max(len(str(x)) for x in col) for col in zip(head, *lines)]
    for line in [head, *lines]:
        print("  ".join(str(x).rjust(n) for x, n in zip(line, w)))
