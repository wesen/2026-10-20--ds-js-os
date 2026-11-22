#!/usr/bin/env python3
"""13-ladder-figure.py: waterfall of B-01's measured cycles per sample, WGSL semantics to all CPU substitutions.

usage: python3 -I 13-ladder-figure.py SCORE.json OUT.png [SCENE]

SCORE.json is 10-score-board.py's output. Each bar after the first spans the change in device cycles per
sample when one switch is added to the previous arm (the ladder order of 04-build.py)."""
import json
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

score = json.load(open(sys.argv[1]))
scene = sys.argv[3] if len(sys.argv) > 3 else "B-01"
cps = lambda a: score["cells"][f"{a}|{scene}"]["cyclesPerSample"]
steps = [("WGSL semantics", "wgsl"), ("lazy select", "lazy"), ("no zero-init", "noinit"), ("floor via fcvt", "floor"),
         ("polynomial sin/cos", "trig"), ("polynomial exp", "exp"), ("integer hash", "hash"), ("sky table", "cpu")]
SURF, INK, INK2, GRID, SAVE, COST, TOTAL = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df", "#2a78d6", "#eb6834", "#8a8984"
fig, ax = plt.subplots(figsize=(8.2, 3.9), dpi=160)
fig.patch.set_facecolor(SURF)
ax.set_facecolor(SURF)
prev = None
labels = []
for i, (label, arm) in enumerate(steps + [("all substitutions", "cpu")]):
    v = cps(arm)
    y = len(steps) - i
    if i == 0 or i == len(steps):
        ax.barh(y, v, height=0.62, color=TOTAL, linewidth=0)
        ax.text(v + 150, y, f"{v:,.0f}", va="center", fontsize=8.5, color=INK)
    else:
        lo, hi = sorted((prev, v))
        ax.barh(y, hi - lo, left=lo, height=0.62, color=SAVE if v < prev else COST, linewidth=0)
        ax.text(hi + 150, y, f"{v - prev:+,.0f}", va="center", fontsize=8.5, color=INK2)
    labels.append((y, label))
    prev = v
ax.set_yticks([y for y, _ in labels], [l for _, l in labels], fontsize=9, color=INK)
ax.set_xlim(0, cps("wgsl") * 1.12)
ax.xaxis.grid(True, color=GRID, linewidth=0.8)
ax.set_axisbelow(True)
for s in ("top", "right", "left"):
    ax.spines[s].set_visible(False)
ax.spines["bottom"].set_color(GRID)
ax.tick_params(axis="x", colors=INK2, labelsize=8.5)
ax.tick_params(axis="y", length=0)
ax.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
ax.set_xlabel("ESP32-P4 cycles per camera sample (one core, 360 MHz)", fontsize=9, color=INK2)
ax.set_title(f"{scene}: each CPU substitution added in turn, measured on the device", fontsize=10.5, color=INK, loc="left")
fig.tight_layout()
fig.savefig(sys.argv[2], facecolor=SURF)
