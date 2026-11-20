"""Summarize paired physical results for four compilers and three native guest functions."""
import argparse
import json
from pathlib import Path
from statistics import median

LABELS={"base":"Production","staged":"Staged stack","native":"Native changes","combined":"Native + cursor"}
GUEST={"files":"compare","agenda":"weekday","editor":"findmatch"}


def paired(left,right):
    if not left.keys()==right.keys() or not left: raise ValueError("unpaired measurements")
    changes=[right[k]-left[k] for k in left]
    pct=[100*(right[k]-left[k])/left[k] for k in left]
    return dict(n=len(changes),baseline=median(left.values()),candidate=median(right.values()),
                change=median(changes),pct=median(pct),range=[min(changes),max(changes)])


def summary(data):
    if not data["restored"] or len(data["boots"])!=2: raise ValueError("incomplete board trial")
    result=[]
    for b,boot in enumerate(data["boots"],1):
        for app,op in GUEST.items():
            def col(lane,metric):
                if metric=="cycles":
                    rows=boot["guest"]
                    if not any(r["op"]==op for r in rows): rows=boot.get("editor_guest",[])
                    return {r["block"]:r["cycles"]/r["count"] for r in rows if r["lane"]==lane and r["op"]==op}
                return {r["block"]:r[metric] for r in boot["rows"] if r["lane"]==lane and r["app"]==app}
            for control,lane in (("base","staged"),("base","native"),("base","combined"),("staged","combined"),("native","combined")):
                row={"boot":b,"app":app,"baseline":control,"candidate":lane}
                for metric in ("us","peak","words","bytes","cycles"):
                    row[metric]=paired(col(control,metric),col(lane,metric))
                result.append(row)
    return result


def plot(table,out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(1,3,figsize=(12,4.4),layout="constrained")
    colors={"files":"#297865","agenda":"#ca753d","editor":"#3e568c"}
    for ax,(metric,ylabel) in zip(axes,[("us","Cold compilation time"),("words","Emitted native words"),("cycles","Cycles per guest call")]):
        for i,(app,color) in enumerate(colors.items()):
            for j,lane in enumerate(("staged","native","combined")):
                obs=[r[metric]["pct"] for r in table if r["baseline"]=="base" and r["app"]==app and r["candidate"]==lane]
                assert len(obs)==2
                x=j+(i-1)*.19
                ax.bar(x,sum(obs)/2,width=.17,color=color,label=app.capitalize() if j==0 else None)
                ax.scatter([x]*2,obs,color="black",s=8,zorder=3)
        ax.axhline(0,color="#666",linewidth=.8)
        ax.set_xticks(range(3),["Staged","Native","Native\n+ cursor"])
        ax.set_title(ylabel,fontsize=11);ax.spines[['top','right']].set_visible(False)
    axes[0].set_ylabel("Change from production (%)")
    axes[0].legend(frameon=False,fontsize=8)
    fig.suptitle("Four compilers on one ESP32-P4 • paired changes across two boots")
    fig.savefig(out,dpi=170)
    plt.close(fig)

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("receipt",type=Path);p.add_argument("out",type=Path);p.add_argument("--figure",type=Path)
    args=p.parse_args()
    result=summary(json.loads(args.receipt.read_text()))
    args.out.write_text(json.dumps(result,indent=2)+"\n")
    if args.figure: plot(result,args.figure)
