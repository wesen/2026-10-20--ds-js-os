"""Plot sampled host compile and linked Wasm event durations for the Chess article."""
import json
from pathlib import Path
import sys

import matplotlib
matplotlib.use("Agg")
from matplotlib import pyplot as plt

input_path, output_path = map(Path, sys.argv[1:])
data = json.loads(input_path.read_text())
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "text.color": "#192c38",
                     "axes.labelcolor": "#192c38", "xtick.color": "#425668", "ytick.color": "#192c38"})
fig, axes = plt.subplots(2, 1, figsize=(9, 5.5))
fig.patch.set_facecolor("#f6f8fa")
fig.text(0.05, 0.972, "Chess on the host", fontsize=21, weight="bold", va="top")
fig.text(0.05, 0.916, "Nine fresh processes per series  ·  dot = median  ·  line = observed range", color="#425668")


def ranges(ax, rows, title, unit, color):
    for y, (label, stats) in enumerate(rows[::-1]):
        ax.hlines(y, stats["min"], stats["max"], lw=3, color=color, alpha=0.45)
        ax.scatter(stats["median"], y, s=52, color=color, zorder=3, edgecolors="white", linewidth=0.7)
    ax.set_title(title, loc="left", weight="bold", fontsize=11)
    ax.set_xlabel(unit, loc="right", fontsize=9)
    ax.set_yticks(range(len(rows)), [label for label, _ in rows[::-1]])
    ax.set_xlim(left=0)
    ax.set_ylim(-0.55, len(rows) - 0.45)
    ax.set_facecolor("#f6f8fa")
    ax.set_axisbelow(True)
    ax.grid(axis="x", color="#d5dee6", lw=0.7)
    ax.tick_params(axis="both", length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)


compiles = data["compile"]
ranges(axes[0], [(label, compiles[target]["statistics"][phase]) for label, target, phase in [
    ("Wasm compiler setup", "wasm", "setupMs"), ("Wasm source → module", "wasm", "compileMs"),
    ("RV32 compiler setup", "rv32", "setupMs"), ("RV32 source → module", "rv32", "compileMs")]],
    "Compilation in QuickJS", "CPU ms", "#176659")
app = data["firstMove"]["statistics"]
ranges(axes[1], [(label, app[key]) for label, key in [
    ("First board frame", "launchFrameMs"), ("White move + thinking frame", "moveAndThinkingFrameMs"),
    ("Search-only wakes, sum", "searchOnlyWakesMs"), ("Last wake + reply frame", "lastWakeAndReplyFrameMs")]],
    "First e2–e4 exchange in linked Wasm", "event wall ms", "#995224")
fig.subplots_adjust(left=0.30, right=0.95, top=0.83, bottom=0.10, hspace=0.74)
fig.savefig(output_path, dpi=165, facecolor=fig.get_facecolor())
