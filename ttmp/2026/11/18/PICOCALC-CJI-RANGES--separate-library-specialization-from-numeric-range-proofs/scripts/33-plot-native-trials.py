"""Plot individual measured frontend samples and paired medians in seconds."""
from pathlib import Path
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ticket = Path(__file__).resolve().parents[1]
fig, axes = plt.subplots(1, 2, figsize=(7.0, 3.3), layout="constrained")
for ax, world in zip(axes, ("agenda", "files")):
    report = json.loads((ticket / "various" / f"{world}-guard-native.json").read_text())
    for i, variant in enumerate(("baseline", "candidate")):
        measurements = report["variants"][variant]
        samples = [r["frontend_us"] / 1e6 for r in measurements["runs"] if not r["warmup"]]
        color = ("#6b7280", "#00695c")[i]
        ax.scatter([i - .06, i, i + .06], samples, s=30, color=color, zorder=3)
        ax.hlines(measurements["median_us"] / 1e6, i - .22, i + .22, color=color, lw=2)
    ax.set_title(world.capitalize())
    ax.set_xticks([0, 1], ["Ordinary", "Guarded"])
    ax.set_xlim(-.45, 1.45)
    ax.set_ylim(bottom=0)
    ax.set_ylabel("Frontend time (seconds)")
    ax.grid(axis="y", color="#dddddd")
    ax.spines[["top", "right"]].set_visible(False)
fig.savefig(ticket / "various" / "native-trials.png", dpi=175)
