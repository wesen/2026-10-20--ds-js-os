"""Plot each independently paired hardware comparison using the published frame summary."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parents[2] / "various/director"
rows = json.loads((root / "frame-result.json").read_text())
fig, axes = plt.subplots(1, 2, figsize=(9, 5.4), sharey=True, layout="constrained")
for ax, phase, title in zip(axes, ["clean", "primary"], ["Complete RGB565 frame", "Primary intersections"]):
    trials = [r for r in rows if r["phase"] == phase]
    for field, label, colour, marker in [("empty", "Skip empty", "#146c83", "o"),
                                         ("full", "Skip empty + unroll full", "#ae5436", "s")]:
        ax.scatter([r[field]["pct"] for r in trials], range(len(trials)), label=label,
                   color=colour, marker=marker, s=33, zorder=3)
    ax.set(yticks=range(len(trials)), yticklabels=[r["pose"].replace("-", " ") for r in trials],
           xlabel="Median paired time saved (%)", title=title)
    ax.set_xlim(left=0)
    ax.grid(axis="both", color="#e4e8eb", linewidth=0.7)
    ax.spines[["top","right", "left"]].set_visible(False)
axes[0].invert_yaxis()
axes[0].legend(loc="lower left", bbox_to_anchor=(0.0, -0.29), ncol=2, frameon=False)
fig.suptitle("Packet classification on twelve physical ESP32-P4 workloads", fontweight="bold", fontsize=14)
fig.savefig(root / "packet-boundaries.png", dpi=145, facecolor="white")
