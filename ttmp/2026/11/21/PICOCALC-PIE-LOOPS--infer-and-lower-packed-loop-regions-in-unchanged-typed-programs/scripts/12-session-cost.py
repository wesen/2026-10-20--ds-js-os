"""Plot the estimated compile plus render time difference over a session."""
from pathlib import Path
import json
from math import ceil
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

device = Path(sys.argv[1])
cold = json.loads((device / "prefilter/summary.json").read_text())
extra = cold["pairedCompilerUs"]["filteredOverStock"]["median"] / 1000
poses = json.loads((device / "summary.json").read_text())["poses"]
saving = {name:p["clean"]["paired"]["stockToPie"]["savedUs"]["median"] / 1000
          for name,p in poses.items()}
frames = list(range(101))
def cost(n, saved):
    return extra - n * saved
fig, ax = plt.subplots(figsize=(8, 4.2), layout="constrained")
ax.fill_between(frames, [cost(n, max(saving.values())) for n in frames],
                [cost(n, min(saving.values())) for n in frames], color="#c8ddeb",
                label="Range of estimates across 12 scene medians")
ax.plot(frames, [cost(n, saving["default"]) for n in frames], color="#145576",
        label="Opening scene estimate")
ax.axhline(0, color="#666", lw=.8)
crossing = ceil(extra / saving["default"])
ax.scatter([crossing], [cost(crossing, saving["default"])], color="#a13d20")
ax.annotate(f"{crossing} completed frames", (crossing,0), xytext=(9,9),
            textcoords="offset points", fontsize=9)
ax.set(xlim=(0,100), xlabel="Completed frames after one cold compile",
       ylabel="Extra time with the pass (ms)")
ax.set_title("When does compiling the packed loop recover its cost?", loc="left")
ax.spines[["top","right"]].set_visible(False)
ax.legend(frameon=False)
fig.savefig(sys.argv[2], dpi=165)
print("Opening break-even", crossing, "scenes", sorted(ceil(extra/s) for s in saving.values()))
for n in (1, 10, 44, 100): print(n, round(cost(n, saving["default"]),3))
