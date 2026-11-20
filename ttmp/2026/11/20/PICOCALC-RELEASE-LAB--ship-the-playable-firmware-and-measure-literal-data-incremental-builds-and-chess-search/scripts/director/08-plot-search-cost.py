"""Make a per-node physical comparison with all quantities read from the benchmark receipt."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ticket = Path(__file__).resolve().parents[2]
rows = json.loads((ticket / "various/chess/summary.json").read_text())["rows"]
labels = {"opening":"Opening","after-e2e4":"After e2e4","kiwipete":"Kiwipete",
          "rook-ending":"Rook ending","pawn-ending":"Pawn ending"}
selected = [r for r in rows if r["position"] in labels and r["budget"] == 30000 and r["depth"] == 3]
assert len(selected) == 5 and all(r["result"]["completed"] == 3 for r in selected)
units = [r["p4MedianUsPerNode"] for r in selected]
instructions = [r["modelInstructionsPerNode"]/1000 for r in selected]
fig, axes = plt.subplots(1,2,figsize=(8.3,3.3),sharey=True,layout="constrained")
for ax, values, title, color in zip(axes,[units,instructions],["P4 µs per search node","Modeled k-instructions per node"],["#176d69","#3665a4"]):
    ax.barh(range(len(selected)), values, color=color, height=.52)
    for i, value in enumerate(values):
        ax.text(value, i, f"  {value:.1f}", va="center", fontsize=8)
    ax.set_xlim(0,1.24*max(values))
    ax.set_xlabel(title)
    ax.spines[["top","right"]].set_visible(False)
axes[0].set_yticks(range(len(selected)),[labels[r["position"]] for r in selected])
axes[0].invert_yaxis()
fig.suptitle("The cost of a search node depends on the position\nAll five searches completed depth three", fontsize=12)
fig.savefig(ticket / "various/search-cost-per-node.png", dpi=160)
