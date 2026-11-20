"""Plot the block means for five measured intervals on the physical PicoCalc."""

import argparse
import json
from pathlib import Path
from statistics import median

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("baseline", type=Path)
p.add_argument("candidate", type=Path)
p.add_argument("output", type=Path)
args = p.parse_args()
intervals = {
    "screenBuild": "Build screen",
    "stringify": "Serialize JSON",
    "compositorSnakeMessage": "Receive Snake frame",
    "compositorDrawDispatch": "Draw and commit",
    "displayFlushTurn": "Display flush turn",
}
fig, ax = plt.subplots(figsize=(8.5, 3.7), layout="constrained")
arms = [
    ("Previous", args.baseline, "#545768", 0.13),
    ("Integrated", args.candidate, "#a4322c", -0.13),
]
for name, source, color, offset in arms:
    blocks = json.loads(source.read_text())["blocks"]
    for i, key in enumerate(intervals):
        points = [b["instrumented"][key] for b in blocks]
        ms = [point["us"] / point["n"] / 1000 for point in points]
        # Vertical offsets make the six repeated measurements visible when close.
        levels = [i + offset + 0.025 * (j - (len(ms) - 1) / 2) for j in range(len(ms))]
        ax.scatter(ms, levels, s=20, facecolor="none", edgecolor=color, linewidth=1)
        ax.plot(
            median(ms),
            i + offset,
            marker="|",
            markersize=17,
            color=color,
            markeredgewidth=2.2,
        )
ax.set_yticks(range(len(intervals)), intervals.values())
ax.invert_yaxis()
ax.set_xlim(left=0)
ax.set_xlabel("Milliseconds per event")
ax.set_title("Time spent processing Snake on the ESP32-P4", loc="left", weight="bold")
ax.xaxis.grid(color="#dddddd", linewidth=0.7)
ax.set_axisbelow(True)
for side in ("left", "top", "right"):
    ax.spines[side].set_visible(False)
ax.legend(
    handles=[
        Line2D(
            [],
            [],
            color=color,
            marker="o",
            markerfacecolor="none",
            linestyle="none",
            label=name,
        )
        for name, _, color, _ in arms
    ],
    loc="lower right",
    frameon=False,
)
fig.savefig(args.output, dpi=150)
