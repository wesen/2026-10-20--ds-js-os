"""Render the supervisor's four-way cold compile and guest instruction measurements."""
from pathlib import Path
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ticket = Path(__file__).resolve().parents[2]
data = ticket / "various/supervisor"
compile_data = json.loads((data / "factorial-editor.json").read_text())["results"]
guest_data = json.loads((data / "editor-steps.json").read_text())["workloads"]
lanes = ["baseline", "candidate", "baseline_stream", "candidate_stream"]
labels = ["Stack slots · byte bodies", "Registers · byte bodies", "Stack slots · streaming", "Registers · streaming"]
colors = ["#596579", "#207474", "#596579", "#207474"]

fig, axes = plt.subplots(1, 2, figsize=(12, 4.1), layout="constrained", width_ratios=[1.15, 1])
left, right = axes
for i, (lane, color) in enumerate(zip(lanes, colors)):
    row = compile_data[lane]
    values = [v["us"]/1000 for v in row["samples"]]
    # Offsets encode trial order and keep repeated marks legible; only x encodes time.
    ys = [i + (j/(len(values)-1) - .5)*.34 for j in range(len(values))]
    left.scatter(values, ys, color=color, alpha=.48, s=12, linewidths=0)
    left.scatter([row["median"]["us"]/1000], [i], c="#152237", marker="|", s=180, linewidths=2)
left.set_yticks(range(4), labels)
left.invert_yaxis()
left.set_xlabel("Elapsed milliseconds (16 fresh runtimes per variant)")
left.set_title("Cold Editor compilation on Linux QuickJS", loc="left", fontsize=12, fontweight="bold")
right_names = ["Edit", "64 KiB open", "Dense inline preview", "Late navigation"]
for i, (name, item) in enumerate(guest_data.items()):
    row = item["measurements"]
    old, new = [row[k]["instructions"]/1e6 for k in ("baseline","candidate")]
    right.plot([new,old],[i,i], color="#b5bdc7", linewidth=2, zorder=0)
    right.scatter([old],[i],color=colors[0],label="Stack slots" if i==0 else None)
    right.scatter([new],[i],color=colors[1],label="Registers" if i==0 else None)
right.set_yticks(range(4),right_names)
right.invert_yaxis()
right.set_xlim(left=0)
right.set_xlabel("Millions of guest instructions, including driver and reactor")
right.set_title("Same RV32 workflow and output", loc="left", fontsize=12,fontweight="bold")
right.legend(loc="center right",frameon=False)
for ax in axes:
    ax.grid(axis="x",color="#d9dde3",alpha=.65)
    ax.set_axisbelow(True)
    ax.spines[["top","right","left"]].set_visible(False)
    ax.tick_params(axis="y",length=0)
assets = ticket / "various/reports/_assets"
assets.mkdir(exist_ok=True, parents=True)
fig.savefig(assets / "picocalc-compiler-thesis-experiments.png", dpi=160, facecolor="white")
