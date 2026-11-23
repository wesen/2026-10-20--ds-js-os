#!/usr/bin/env python3
"""12-table.py: a Markdown table of host instructions per sample from 01-count.mjs --json files (PICOCALC-CANDELA-KERNEL-CODEGEN).

usage: python3 -I 12-table.py NAME=FILE.json ...

One row per scene (in the first file's order): each file's instructions per sample and its ratio to the C++ arm, then
the geometric means of the ratios over all scenes and over the kernel-bound scenes (B-01, R-01, L-03, V-02, W-02)."""
import json
import math
import sys

KERNEL = ["B-01", "R-01", "L-03", "V-02", "W-02"]
runs = []
for arg in sys.argv[1:]:
    name, path = arg.split("=", 1)
    with open(path) as f:
        runs.append((name, {r["id"]: r for r in json.load(f)["results"]}))
ids = list(runs[0][1])
head = "| Scene | C++ | " + " | ".join(f"{n} | ratio" for n, _ in runs) + " |"
print(head)
print("|" + "---|" * (2 + 2 * len(runs)))
for i in ids:
    cpp = runs[0][1][i]["cppPerSample"]
    cells = []
    for _, r in runs:
        x = r[i]
        cells += [f"{x['perSample']:,.1f}", f"{x['perSample'] / cpp:.3f}"]
    print(f"| {i} | {cpp:,.1f} | " + " | ".join(cells) + " |")


def geo(r, keys):
    return math.exp(sum(math.log(r[k]["perSample"] / r[k]["cppPerSample"]) for k in keys) / len(keys))


print("| geometric mean, 18 scenes | | " + " | ".join(f"| {geo(r, ids):.3f}" for _, r in runs) + " |")
print("| geometric mean, kernel-bound | | " + " | ".join(f"| {geo(r, KERNEL):.3f}" for _, r in runs) + " |")
