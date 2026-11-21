"""Draw each pose median and observed range across six paired blocks."""
import json
import sys
from pathlib import Path
from statistics import median
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

rows = json.loads(Path(sys.argv[1]).read_text())
times = {(r["fixture"], r["block"], r["program"]): r["timesUs"][2][0] for r in rows}
poses = sorted({r["fixture"] for r in rows})
fig, ax = plt.subplots(figsize=(8.3, 5.2), layout="constrained")
for offset, control, color, label in [
    (-0.13, 0, "#125a81", "Stock to inferred PIE"),
    (0.13, 8, "#a94421", "Matched scalar to inferred PIE"),
]:
    for i, pose in enumerate(poses):
        values = [(times[pose,b,control] - times[pose,b,5]) / 1000 for b in range(6)]
        y = i + offset
        ax.plot([min(values), max(values)], [y,y], color=color, alpha=.68)
        ax.scatter(median(values), y, color=color, s=22, label=label if i == 0 else None)
ax.set_yticks(range(len(poses)), poses)
ax.invert_yaxis()
ax.set_xlim(left=0)
ax.set_xlabel("Time saved per complete frame (ms)")
ax.set_title("Eight-lane subtraction in the unchanged Typed ray tracer", loc="left")
ax.grid(axis="x", alpha=.16)
ax.spines[["right", "top"]].set_visible(False)
ax.legend(loc="upper center", bbox_to_anchor=(.5, -.13), ncol=2, frameon=False)
fig.savefig(sys.argv[2], dpi=165)
