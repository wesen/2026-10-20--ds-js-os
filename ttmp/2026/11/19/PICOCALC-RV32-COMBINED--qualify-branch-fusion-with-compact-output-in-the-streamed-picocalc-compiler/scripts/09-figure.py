"""Plot the within-block change from the streamed control for each app and boot."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from statistics import median

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("summary",type=Path)
p.add_argument("image",type=Path)
args=p.parse_args()
boots=json.loads(args.summary.read_text())
apps=["files","agenda","editor"]
colors=["#216d89","#ab591e"]
fig,axes=plt.subplots(2,1,figsize=(7.6,5.7),layout="constrained")
for ax,metric,unit,title in zip(axes,["us","peak"],[1000,1024],["Elapsed time (ms)","Peak live QuickJS memory (KiB)"]):
    ax.axvline(0,color="#666",lw=1)
    for n,boot in enumerate(boots):
        for y,app in enumerate(apps):
            delta=[-v/unit for v in boot[app][metric]["both_vs_base_savings"]]
            y=y+(n-.5)*.24
            ax.plot([min(delta),max(delta)],[y,y],lw=1.4,color=colors[n])
            ax.plot(delta,[y]*len(delta),'|',color=colors[n],ms=8)
            ax.plot(median(delta),y,'o',color=colors[n],ms=6)
    ax.set_yticks(range(3),[a.capitalize() for a in apps])
    ax.set_ylim(2.5,-.5)
    ax.set_title(title,loc="left",fontsize=11)
    ax.grid(axis="x",alpha=.13)
    ax.spines[["top","right","left"]].set_visible(False)
fig.suptitle("Combined compiler minus streamed control",fontsize=14)
fig.legend(handles=[Line2D([],[],color=c,marker="o",label=f"Boot {n+1}") for n,c in enumerate(colors)],
           loc="outside lower center",ncol=2,frameon=False)
fig.savefig(args.image,dpi=155)
