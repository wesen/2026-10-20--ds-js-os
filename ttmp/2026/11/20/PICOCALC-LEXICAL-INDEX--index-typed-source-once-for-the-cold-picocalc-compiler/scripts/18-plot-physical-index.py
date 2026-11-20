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
    variants = [
        ("manual", "Handwritten", "#6c7882"),
        ("async", "Generated", "#52728a"),
        ("index", "Indexed", "#26887c"),
        ("index-reuse", "Indexed + reuse", "#167461"),
        ("indexed-prepass", "+ body index", "#5752a2"),
        ("indexed-spans", "+ body index + spans", "#725097"),
    ]
    variants = [item for item in variants if item[0] in data["arms"]]
    labels = [label for _, label, _ in variants]
    fig,axes=plt.subplots(1,2,figsize=(8.4,3.3),layout="constrained")
    for ax,metric,unit,title,limit,scale in zip(
            axes,("us","peak"),("Seconds","MiB"),("Cold native compilation","Peak compiler allocation"),
            (data["ceiling_us"]/1e6,4.0),(1e6,1024**2)):
        for i,(key,label,color) in enumerate(variants):
            row=data["arms"][key][metric]
            value=row["median"]/scale
            ax.barh(i,value,height=.52,color=color)
            ax.scatter([x/scale for x in row["samples"]],[i-.12,i,i+.12],color="#11282d",s=8,zorder=3)
            ax.text(value+.05,i,f"{value:.3f}",va="center",fontsize=8)
        ax.axvline(limit,color="#9c4327",linewidth=1.3,linestyle="--",label=f"Limit {limit:.2f} {unit.lower()}")
        ax.set(yticks=range(len(variants)),yticklabels=labels,xlabel=unit,title=title,xlim=(0,4.55))
        ax.invert_yaxis()
        ax.spines[["top","right"]].set_visible(False)
        ax.legend(loc="lower center",bbox_to_anchor=(.5,-.42),frameon=False,fontsize=8)
    fig.savefig(args.output,dpi=170)


if __name__=="__main__":main()
