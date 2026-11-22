#!/usr/bin/env python3
"""12-cost-figure.py: extra RV32 instructions per camera sample when sections are interpreted, per preset.

usage: python3 -I 12-cost-figure.py COST_KERNEL.json COST_HARNESS.json OUT_KERNEL.png OUT_HARNESS.png
The inputs are 11-cost-table.py's outputs.
  OUT_KERNEL   CPU-KERNEL's kernel (cpu arm, its RV32 flags): (interpreted / compiled - 1) in percent, one bar per
               preset, path-traced presets first, then the custom integrator, heightfield, volume and SDF presets.
  OUT_HARNESS  the prototype harness, first against final interpreter, for the presets counted with both at the
               same frame size."""
import json
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

kfile, hfile, kout, hout = sys.argv[1:5]
SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE = "#2a78d6", "#eb6834"
KIND = {"B-01": "path-traced", "R-01": "path-traced", "L-03": "path-traced", "G-01": "path-traced", "F-01": "path-traced",
        "W-02": "path-traced", "K-04": "path-traced, mesh", "E-02": "custom integrator", "R-04": "heightfield", "V-04": "volume",
        "R-05": "SDF", "R-08": "SDF + heightfield", "S-02": "SDF, spectral", "G-02": "SDF", "X-04": "SDF (Menger sponge)"}
ORDER = ["B-01", "R-01", "L-03", "G-01", "F-01", "W-02", "K-04", "E-02", "R-04", "V-04", "R-08", "R-05", "S-02", "G-02", "X-04"]


def axes(n):
    fig, ax = plt.subplots(figsize=(8.6, 0.38 * n + 1.5), dpi=160)
    fig.patch.set_facecolor(SURF); ax.set_facecolor(SURF)
    ax.tick_params(axis="x", colors=INK2, labelsize=8); ax.tick_params(axis="y", length=0)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8); ax.set_axisbelow(True)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    return fig, ax


def finish(fig, ax, labels, title, vmax, out):
    ax.set_yticks(range(len(labels))); ax.set_yticklabels(labels, fontsize=9, color=INK); ax.invert_yaxis()
    ax.set_xlabel("extra RV32 instructions per camera sample, interpreted against compiled sections (%)", fontsize=9, color=INK2)
    ax.set_xlim(0, vmax * 1.13)
    ax.set_title(title, fontsize=10.5, color=INK, loc="left")
    fig.tight_layout(); fig.savefig(out, facecolor=SURF); print("wrote", out)


# kernel figure: one series
rows = {r["preset"]: r for r in json.load(open(kfile))["kernel"] if r["target"] == "rv32"}
ps = [p for p in ORDER if p in rows]
fig, ax = axes(len(ps))
vals = [100 * (rows[p]["ratio"] - 1) for p in ps]
for i, v in enumerate(vals):
    ax.barh(i, v, height=0.62, color=ORANGE, edgecolor=SURF, linewidth=1)
    ax.text(v + 2, i, f"{v:.1f}%", va="center", ha="left", fontsize=8, color=INK2)
finish(fig, ax, [f"{p}  {KIND.get(p, '')}" for p in ps], "Interpreted scene code in the firmware kernel (cpu arm, rv32imafc -O2)", max(vals), kout)

# harness figure: first against final interpreter
best = {}
for r in json.load(open(hfile))["harness"]:
    area = int(r["frame"].split("x")[0]) * int(r["frame"].split("x")[1])
    k = (r["run"], r["preset"])
    if k not in best or area > best[k][0]:
        best[k] = (area, r)
ps = [p for p in ORDER if ("first", p) in best and ("final", p) in best and best[("first", p)][1]["frame"] == best[("final", p)][1]["frame"]]
fig, ax = axes(len(ps))
h, vmax = 0.36, 0
for i, p in enumerate(ps):
    for j, (run, col) in enumerate((("first", BLUE), ("final", ORANGE))):
        v = 100 * (best[(run, p)][1]["ratio"] - 1); vmax = max(vmax, v)
        y = i + (j - 0.5) * (h + 0.04)
        ax.barh(y, v, height=h, color=col, edgecolor=SURF, linewidth=1)
        ax.text(v + 2, y, f"{v:.1f}%", va="center", ha="left", fontsize=8, color=INK2)
ax.legend([plt.Rectangle((0, 0), 1, 1, color=BLUE), plt.Rectangle((0, 0), 1, 1, color=ORANGE)],
          ["first interpreter (switch dispatch, library copies)", "final interpreter (label-table dispatch, inline copies)"],
          loc="upper right", frameon=False, fontsize=8, labelcolor=INK)
finish(fig, ax, [f"{p}  {KIND.get(p, '')}" for p in ps], "First and final interpreter (prototype kernel, rv32imafc -O2)", vmax, hout)
