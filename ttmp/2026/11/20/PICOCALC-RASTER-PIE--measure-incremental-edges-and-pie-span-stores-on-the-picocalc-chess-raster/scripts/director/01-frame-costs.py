"""Regenerate two plots from independent P4 capture protocols."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parents[2]
rows = json.loads((root/"various/physical.json").read_text())["rasterCycles"]
damage = json.loads((root/"scripts/damage/board.json").read_text())["runs"][0]["cases"]
figure, axes = plt.subplots(1,2,figsize=(11.2,4.6),layout="constrained")
groups = ["stock","edges","scalar","pie"]
opening = {r["arm"]:r["median"]/360000 for r in rows if r["scene"]=="e2" and not r["validation"]}
a = axes[0]
for y,k in enumerate(groups):
    a.barh(y,opening[k],color=["#63717d","#63717d","#1a7267","#1a7267"][y])
    a.text(opening[k]+.33,y,f"{opening[k]:.2f}",va="center")
a.set(yticks=range(4),yticklabels=["Original","Stepped edges","Validated spans","Packed clear"],xlabel="Body draw (ms)",xlim=(0,21),title="Opening position, full draw")
a.invert_yaxis()
b=axes[1]
selected=[v for v in damage if v["name"] in ("cursor-up","cursor-right","move-e4","camera","unchanged")]
for i,v in enumerate(selected):
    for dx,field,color in [(-.17,"fullMedian","#63717d"),(.17,"damageMedian","#dd8c35")]:
        n=v[field]/360000
        b.barh(i+dx,n,height=.30,color=color,label=("Full replay" if dx<0 else "Retained") if i==0 else None)
        b.text(n+.20,i+dx,f"{n:.1f}",va="center",fontsize=8)
b.set(yticks=range(len(selected)),yticklabels=[v["name"] for v in selected],xlabel="Body draw (ms)",xlim=(0,23),title="Same transition, two repaint policies")
b.invert_yaxis(); b.legend(frameon=False,loc="lower right",fontsize=8)
for ax in axes:
    ax.spines[["top","right","left"]].set_visible(False)
    ax.tick_params(axis="y",length=0)
    ax.set_axisbelow(True); ax.grid(axis="x",alpha=.2)
figure.savefig(root/"various/director-frame-costs.png",dpi=150)
