"""Plot absolute device costs and treatment effects from the independently replayable JS summary."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ticket=Path(__file__).resolve().parents[2]
data=json.loads((ticket/"various/director/summary.json").read_text())
f, axes=plt.subplots(1,2,figsize=(11,4.0),gridspec_kw={"width_ratios":[1.2,1]})
ax=axes[0]
a=data["pred"]["natural"]
labels=["C, native layout","C, Typed layout","C, checked layout","Typed control","Typed shadow-only"]
values=[a["typed"]["control"],a["layout-c"]["candidate"],a["checked-c"]["candidate"],
        a["typed"]["candidate"],a["shadow-only"]["candidate"]]
bars=ax.barh(labels,values,color=["#617487"]*3+["#375988","#19765b"])
ax.invert_yaxis()
for bar,v in zip(bars,values):
    ax.text(v+5,bar.get_y()+bar.get_height()/2,f"{v:.1f}",va="center",fontsize=9)
ax.set_xlim(0,max(values)*1.17)
ax.set_xlabel("P4 cycles per opening floor query")
ax.set_title("Same inputs, different generated code",loc="left",fontsize=12)
ax=axes[1]
series=data["frame"]
scene=list(series)
x=[series[p]["full"]["shadow-only"]["pct"] for p in scene]
for i,v in enumerate(x):
    ax.plot(v,i,"o",color="#19765b",ms=4)
ax.axvline(0,color="#78838a",linewidth=.8)
ax.set_yticks(range(len(scene)),scene,fontsize=8)
ax.invert_yaxis()
ax.set_xlabel("Paired full-frame time saved (%)")
ax.set_title("Effect across twelve fixtures",loc="left",fontsize=12)
for ax in axes:
    ax.spines[["top","right"]].set_visible(False)
    ax.grid(axis="x",alpha=.18)
    ax.set_axisbelow(True)
f.tight_layout(w_pad=2)
f.savefig(ticket/"various/director/physical-shadow.png",dpi=170,bbox_inches="tight")
