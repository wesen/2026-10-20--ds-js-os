"""Plot physical measurements from the validated common-control receipt."""
from pathlib import Path
import argparse
import json
from statistics import median
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("receipt",type=Path)
p.add_argument("png",type=Path)
a=p.parse_args()
d=json.loads(a.receipt.read_text())
lanes=["base","branch","compact","direct"]
colors=["#66788a","#265892","#27704d","#9c551c"]
labels=["Control","Branch fusion","Compact","Direct"]
fig,axes=plt.subplots(2,1,figsize=(7.6,5.7),layout="constrained")
for ax,field,scale,title in zip(axes,["us","peak"],[1e6,1024],["Cold Editor compilation (seconds)","Peak live QuickJS allocation (KiB)"]):
    for y,(lane,c) in enumerate(zip(lanes,colors)):
        v=[row[field]/scale for row in d["rows"] if row["lane"]==lane]
        lo,hi=min(v),max(v)
        ax.hlines(y,lo,hi,color=c,linewidth=2)
        ax.plot(v,[y]*len(v),'|',color=c,markersize=11)
        ax.scatter(median(v),y,color=c,s=39,zorder=3)
    ax.set_yticks(range(len(labels)),labels)
    ax.set_ylim(3.5,-.5)
    ax.set_title(title,loc="left",fontsize=12)
    ax.margins(x=.12)
    ax.grid(axis="x",alpha=.16)
    ax.spines[["top","right","left"]].set_visible(False)
fig.suptitle("ESP32-P4 • four clean observations per compiler",fontsize=14)
fig.savefig(a.png,dpi=160)
