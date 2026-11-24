#!/usr/bin/env python3
"""15-compare-study.py: two paired board studies' summaries side by side (PICOCALC-CANDELA-KERNEL-CODEGEN).

usage: python3 -I 15-compare-study.py BASE/summary.json NEW/summary.json

A Markdown table per scene: Typed and C++ cycles per sample (medians over blocks), the Typed/C++ ratio of each study
with the new study's per-block range, and the new Typed cycles as a fraction of the base's; then the geometric means of
the ratios over the 18 scenes and over the kernel-bound scenes (B-01, R-01, L-03, V-02, W-02)."""
import json
import math
import sys

KERNEL = ["B-01", "R-01", "L-03", "V-02", "W-02"]
base, new = (json.load(open(p))["scenes"] for p in sys.argv[1:3])


def geo(s, ids):
    return math.exp(sum(math.log(s[i]["ratioCycles"]) for i in ids) / len(ids))


print("| Scene | Typed before | Typed after | C++ | ratio before | ratio after (block range) | Typed after/before | digests |")
print("|---|---:|---:|---:|---:|---:|---:|---|")
for i in base:
    b, n = base[i], new[i]
    lo, hi = n["ratioCyclesRange"]
    print(f"| {i} | {b['typedCyclesPerSample']:,.0f} | {n['typedCyclesPerSample']:,.0f} | {n['cppCyclesPerSample']:,.0f} | "
          f"{b['ratioCycles']:.3f} | {n['ratioCycles']:.3f} ({lo:.3f}-{hi:.3f}) | "
          f"{n['typedCyclesPerSample'] / b['typedCyclesPerSample']:.3f} | {'match' if n['digestsMatchReference'] else 'DIFFER'} |")
ids = list(base)
print(f"| geometric mean, 18 scenes | | | | {geo(base, ids):.3f} | {geo(new, ids):.3f} | | |")
print(f"| geometric mean, kernel-bound | | | | {geo(base, KERNEL):.3f} | {geo(new, KERNEL):.3f} | | |")
