"""Plot per-invocation time and tracked compiler allocation from the physical P4 receipt."""
import json
from pathlib import Path
from statistics import median
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ticket = Path(__file__).resolve().parents[2]
lanes = json.loads((ticket/"various/supervisor/physical-editor.json").read_text())["lanes"]
names = ["original","register","packed","stream"]
labels = ["Original","Register backend","Numeric · buffered","Numeric · streamed"]
figure, axes = plt.subplots(1, 2, figsize=(10,3.2), layout="constrained", sharey=True)
for ax, (field, scale, heading) in zip(axes, [("us", 1e6, "Seconds per Editor compile"),
                                              ("peak_js_bytes", 1e6, "Peak compiler allocation (MB)")]):
    for y, name in enumerate(names):
        points = [r[field]/scale for r in lanes[name]]
        ax.hlines(y, 0, median(points), color="#c4d5da", linewidth=3)
        for i, point in enumerate(points):
            ax.scatter(point, y + (i-1.5)*.075, color="#16737b", s=17)
        ax.text(median(points)+.075, y, f"{median(points):.3f}", va="center", fontsize=9)
    ax.set_title(heading, loc="left", fontsize=11)
    ax.set_xlim(0, max(r[field]/scale for name in names for r in lanes[name]) * 1.21)
    ax.spines[["top","left","right"]].set_visible(False)
    ax.grid(axis="x", alpha=.2)
    ax.tick_params(axis="y", length=0)
axes[0].set_yticks(range(4), labels)
axes[0].invert_yaxis()
figure.suptitle("Physical ESP32-P4 · four fresh compiler runtimes per configuration", fontweight="bold")
figure.savefig(ticket/"various/reports/_assets/picocalc-p4-compiler-qualification.png", dpi=155)
