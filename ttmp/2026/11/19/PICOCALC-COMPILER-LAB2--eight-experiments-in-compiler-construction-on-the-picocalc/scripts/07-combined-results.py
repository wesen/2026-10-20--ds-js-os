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


def verify_trial(data):
    if not data["restored"] or len(data["boots"]) != 2:
        raise ValueError("incomplete board trial")
    expected_worlds = {app: {"engine": "native", "file": f"{app}/compiled.bin", "last_error": ""}
                       for app in GUEST}
    if data["restored_worlds"] != expected_worlds:
        raise ValueError("factory applications failed restoration")
    oracle = data["oracle"]
    if set(oracle) != set(LABELS) or oracle["native"] != oracle["combined"]:
        raise ValueError("native-only and combined reference outputs must match on all three apps")
    for app in GUEST:
        configurations = {(lane[app]["sourceSha256"], lane[app]["reactorSha256"]) for lane in oracle.values()}
        if len(configurations) != 1:
            raise ValueError(f"source or reactor differs across compilers for {app}")
    for boot in data["boots"]:
        if boot["worlds"] != expected_worlds:
            raise ValueError("research image failed native smoke test")
        rows = boot["rows"]
        samples = {(r["block"], r["lane"], r["app"]) for r in rows}
        required = {(block, lane, app) for block in range(8) for lane in LABELS for app in GUEST}
        if len(rows) != len(required) or samples != required:
            raise ValueError("missing or duplicated cold sample")
        for row in rows:
            reference = oracle[row["lane"]][row["app"]]
            if any(row[key] != reference[key] for key in ("sha256", "bytes", "words")):
                raise ValueError("cold sample disagrees with full reference image")
        guest = boot["guest"]
        batches = {(r["block"], r["lane"], r["op"]) for r in guest}
        required = {(block, lane, op) for block in range(16) for lane in LABELS for op in GUEST.values()}
        if len(guest) != len(required) or batches != required or any(r["count"] != 128 for r in guest):
            raise ValueError("missing, duplicated or short guest batch")


def summary(data):
    verify_trial(data)
    result=[]
    for b,boot in enumerate(data["boots"],1):
        for app,op in GUEST.items():
            def col(lane,metric):
                if metric=="cycles":
                    rows=boot["guest"]
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
    axes[0].legend(frameon=False,fontsize=8,ncol=3,loc="upper center",bbox_to_anchor=(.50,-.16))
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
