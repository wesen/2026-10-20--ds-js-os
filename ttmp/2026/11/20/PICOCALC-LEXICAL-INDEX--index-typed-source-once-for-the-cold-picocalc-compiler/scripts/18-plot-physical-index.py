"""Plot per-boot physical observations with the two explicit qualification limits."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    data=json.loads(args.receipt.read_text())
    labels=("Handwritten","Generated","Indexed","Indexed + reuse")
    keys=("manual","async","index","index-reuse")
    fig,axes=plt.subplots(1,2,figsize=(8.4,3.3),layout="constrained")
    for ax,metric,unit,title,limit,scale in zip(
            axes,("us","peak"),("Seconds","MiB"),("Cold native compilation","Peak compiler allocation"),
            (data["ceiling_us"]/1e6,4.0),(1e6,1024**2)):
        for i,(label,key) in enumerate(zip(labels,keys)):
            row=data["arms"][key][metric]
            value=row["median"]/scale
            ax.barh(i,value,height=.52,color=("#6c7882","#52728a","#26887c","#167461")[i])
            ax.scatter([x/scale for x in row["samples"]],[i-.12,i,i+.12],color="#11282d",s=8,zorder=3)
            ax.text(value+.05,i,f"{value:.3f}",va="center",fontsize=8)
        ax.axvline(limit,color="#9c4327",linewidth=1.3,linestyle="--",label=f"Limit {limit:.2f} {unit.lower()}")
        ax.set(yticks=range(4),yticklabels=labels,xlabel=unit,title=title,xlim=(0,4.55))
        ax.invert_yaxis()
        ax.spines[["top","right"]].set_visible(False)
        ax.legend(loc="lower center",bbox_to_anchor=(.5,-.42),frameon=False,fontsize=8)
    fig.savefig(args.output,dpi=170)


if __name__=="__main__":main()
