"""Summarize native return intervals by edit, boot and retained-fragment budget."""
import argparse
import json
from pathlib import Path
from statistics import median

MODES = ("Warm clean","256 KiB","40 KiB")
EDITS = ("Body","Signature and callers","File handle layout","Preview row layout")


def summarize(receipt):
    if not receipt["restored"] or len(receipt["boots"]) != 2:
        raise ValueError("the completed two-boot receipt is required")
    result=[]
    for boot_index,boot in enumerate(receipt["boots"],1):
        rows={(r["round"],r["edit"],r["mode"]):r for r in boot["rows"]}
        if len(rows)!=36: raise ValueError("incomplete boot")
        for edit,name in enumerate(EDITS):
            clean=[rows[r,edit,0] for r in range(3)]
            for mode,policy in enumerate(MODES):
                group=[rows[r,edit,mode] for r in range(3)]
                us=[r["us"] for r in group]
                effect=[b["us"]-a["us"] for a,b in zip(clean,group)]
                pct=[(b["us"]-a["us"])*100/a["us"] for a,b in zip(clean,group)]
                result.append(dict(boot=boot_index,edit=name,policy=policy,
                    ms=median(us)/1000,paired_ms=median(effect)/1000,paired_pct=median(pct),
                    effect_range_ms=[min(effect)/1000,max(effect)/1000],
                    before=median(r["before"] for r in group),peak=median(r["peak"] for r in group),
                    load_ms=median(r["load_us"] for r in group)/1000,guest_us=median(r["guest_us"] for r in group),
                    retained_bytes=group[0]["word_bytes"],cached=group[0]["retained"],reused=group[0]["reused"],rebuilt=group[0]["built"]))
    return result


def figure(result,out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(1,2,figsize=(11.2,4.8),layout="constrained")
    for ax,(field,scale,label) in zip(axes,[("ms",1000,"Edit to native return (s)"),("peak",1024**2,"Peak compiler heap (MiB)")]):
        for pos,(name,color) in enumerate(zip(MODES,["#354046","#287779","#ac572c"])):
            x=[i+0.23*(pos-1) for i in range(4)]
            groups=[[r[field]/scale for r in result if r["policy"]==name and r["edit"]==edit] for edit in EDITS]
            ax.bar(x,[sum(g)/len(g) for g in groups],width=.21,color=color,label=name,alpha=.84)
            for xi,ys in zip(x,groups):
                ax.scatter([xi]*len(ys),ys,color="black",s=9,zorder=3)
        ax.set_xticks(range(4),["Body","Signature","Handle\nlayout","Preview\nlayout"])
        ax.set_ylabel(label);ax.set_ylim(bottom=0);ax.spines[['top','right']].set_visible(False)
    axes[0].legend(frameon=False,loc="upper center",bbox_to_anchor=(.5,-.16),ncol=3,fontsize=9)
    fig.suptitle("Rebuilding the typed Editor on the ESP32-P4",fontsize=16)
    fig.savefig(out,dpi=170)
    plt.close(fig)


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("receipt",type=Path); p.add_argument("out",type=Path); p.add_argument("--figure",type=Path)
    args=p.parse_args()
    summary=summarize(json.loads(args.receipt.read_text()))
    args.out.write_text(json.dumps(summary,indent=2)+"\n")
    if args.figure: figure(summary,args.figure)
