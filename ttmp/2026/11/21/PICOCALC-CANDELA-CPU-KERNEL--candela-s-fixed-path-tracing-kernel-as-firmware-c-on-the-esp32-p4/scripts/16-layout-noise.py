#!/usr/bin/env python3
"""16-layout-noise.py: how much do cycles change between two board images when the measured code does not?

usage: python3 -I 16-layout-noise.py SCORE_A.json SCORE_B.json ARM[,ARM...]

SCORE_A and SCORE_B are 10-score-board.py outputs of two timing runs. ARMs are the arms whose kernel machine
code is identical in both images (checked separately by disassembly); their code, the scene sections and the
libm functions they call sit at different addresses when other arms change size. Prints the cycle changes per
sample, the L1 instruction-cache miss changes, and their correlation: the precision of an arm-to-arm comparison
across builds."""
import json
import sys

import numpy as np

a = json.load(open(sys.argv[1]))["cells"]
b = json.load(open(sys.argv[2]))["cells"]
arms = set(sys.argv[3].split(","))
rows = [(k, a[k]["cyclesPerSample"] - b[k]["cyclesPerSample"], a[k]["cyclesPerSample"] / b[k]["cyclesPerSample"] - 1,
         a[k]["cache"]["l1i0_miss"] - b[k]["cache"]["l1i0_miss"]) for k in a if k.split("|")[0] in arms and k in b]
dc = np.array([r[1] for r in rows])
rel = np.array([r[2] for r in rows])
dm = np.array([r[3] for r in rows])
print(f"{len(rows)} arm x scene cells with identical kernel code")
print(f"cycles per sample: median |change| {np.median(abs(dc)):.0f} ({np.median(abs(rel)):.2%}), largest {abs(dc).max():.0f} ({abs(rel).max():.2%})")
print(f"L1 instruction misses per sample: median |change| {np.median(abs(dm)):.0f}, largest {abs(dm).max():.0f}")
slope, icpt = np.polyfit(dm, dc, 1)
print(f"correlation of the two changes {np.corrcoef(dc, dm)[0, 1]:.2f}; {slope:.2f} cycles per additional L1 instruction miss")
for k, d, r, m in sorted(rows, key=lambda r: -abs(r[2]))[:6]:
    print(f"  {k}: {d:+.0f} cycles ({r:+.2%}), {m:+.0f} L1I misses")
