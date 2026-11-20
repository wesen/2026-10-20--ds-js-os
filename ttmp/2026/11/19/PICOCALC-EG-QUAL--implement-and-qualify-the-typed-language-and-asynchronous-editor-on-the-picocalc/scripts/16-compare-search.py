"""Pair complete, checked searches by query and engine and render the handheld's elapsed and CPU times."""
import argparse
import json
from pathlib import Path
from statistics import median
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def read(directory):
    sample=json.loads((directory/"physical.json").read_text())
    if not sample["restored"] or sample["input_bytes"]!=65536:
        raise ValueError(f"incomplete search benchmark at {directory}")
    out={}
    for trial in sample["trials"]:
        cases={row["case"]:row for row in trial["rows"]}
        if set(cases)!={"early","miss","late"}:
            raise ValueError("expected all three independently checked terminal frames")
        for case,row in cases.items():
            out[trial["engine"],trial["trial"],case]=row
    if {key[0] for key in out}!={"rv32","wasm"}: raise ValueError("missing physical engine")
    return sample["sha256"],out


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("before",type=Path)
    p.add_argument("after",type=Path)
    p.add_argument("output",type=Path)
    p.add_argument("--plot",type=Path,required=True)
    a=p.parse_args()
    left_hash,left=read(a.before)
    right_hash,right=read(a.after)
    if left_hash!=right_hash or left.keys()!=right.keys():
        raise ValueError("search documents or round schedules differ")
    summary={"input_sha256":left_hash,"rows":[]}
    for key in sorted(left):
        engine,trial,case=key
        old,new=left[key],right[key]
        if old["query"]!=new["query"]: raise ValueError("queries differ")
        row=dict(engine=engine,trial=trial,case=case,query=old["query"])
        for metric in ("wall_us","editor_cpu_us","engine_us","editor_segments","settlements"):
            x,y=old[metric],new[metric]
            row[metric]={"before":x,"after":y,"delta":y-x,"percent":100*(y/x-1) if x else None}
        summary["rows"].append(row)
    a.output.write_text(json.dumps(summary,indent=2)+"\n")
    fig,axes=plt.subplots(2,2,figsize=(8.0,5.8),constrained_layout=True)
    for r,engine in enumerate(("wasm","rv32")):
        for c,(metric,title) in enumerate((("wall_us","Elapsed to retained frame"),("editor_cpu_us","Editor CPU"))):
            ax=axes[r,c]
            for i,case in enumerate(("early","miss","late")):
                rows=[row for row in summary["rows"] if row["case"]==case and row["engine"]==engine]
                for off,arm,color in ((-0.18,"before","#245c85"),(0.18,"after","#b04f28")):
                    value=median(row[metric][arm] for row in rows)/1000
                    ax.bar(i+off,value,0.32,color=color,label=("Manual" if arm=="before" else "Await") if i==0 else None)
            ax.set_title(engine.upper()+" · "+title,fontsize=10)
            ax.set_xticks(range(3),["Early hit","Dense miss","Tail hit"])
            ax.set_ylabel("Milliseconds")
            ax.spines[["top","right"]].set_visible(False)
    axes[0,0].legend(fontsize=8,frameon=False)
    fig.suptitle("Three complete searches in the same 65,536-byte document",fontweight="bold",fontsize=12)
    fig.savefig(a.plot,dpi=165,facecolor="white")


if __name__=="__main__": main()
