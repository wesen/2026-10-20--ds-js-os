"""Regenerate the cross-study compact tables and independent board comparison figure."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE=Path(__file__).resolve().parent
EVIDENCE=HERE.parent/"various"
RUNS=(
    ("scanner-independent-summary.json","cursor","Cursor scanner"),
    ("native-summary.json","fusion","Comparison and branch fusion"),
    ("native-summary.json","staged","Staged native operands"),
    ("bounded-summary.json","always","Analyze every eligible function"),
    ("bounded-summary.json","select","Select functions with division"),
)
APPS=("files","agenda","editor")


def table(evidence):
    data=[]
    for name,lane,label in RUNS:
        receipt=json.loads((evidence/name).read_text())
        for app in APPS:
            boots=sorted((r for r in receipt if r["lane"]==lane and r["app"]==app),key=lambda r:r["boot"])
            if [r["boot"] for r in boots] != [1,2]:
                raise ValueError(f"missing two independent boots for {label} and {app}")
            row={"design":label,"app":app}
            for metric in ("us","peak","words","bytes","guest_cycles_per_call"):
                if metric in boots[0]:
                    row[metric]={k:[r[metric][k] for r in boots] for k in ("difference","percent","base_median","candidate_median")}
            data.append(row)
    return data


def markdown_table(data, evidence):
    frequency = set()
    for name, _, _ in RUNS:
        receipt = json.loads((evidence/name.replace("summary", "physical")).read_text())
        frequency.update(batch["clock_hz"] for boot in receipt["boots"] for batch in boot["guest"])
    if len(frequency) != 1:
        raise ValueError(f"inconsistent clock rates {frequency}")
    cycles_per_us = frequency.pop()/1_000_000
    rows=["| App | Compiler | Cold ms, boots 1 / 2 | Cold change, % | Peak KiB, boot 1 | Code bytes | Guest µs/call, boot 1 |",
          "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]
    labels={"Cursor scanner":"Cursor", "Staged native operands":"Staged", "Comparison and branch fusion":"Fusion",
            "Analyze every eligible function":"Always", "Select functions with division":"Select"}
    for app in APPS:
        variants = [r for r in data if r["app"]==app]
        for r,side in [(variants[0],"base_median")]+[(variant,"candidate_median") for variant in variants]:
            ref = side=="base_median"
            label = "Control (scanner trial)" if ref else labels[r["design"]]
            times = " / ".join(f"{us/1000:.1f}" for us in r["us"][side])
            pct = "reference" if ref else " / ".join(f"{x:+.1f}" for x in r["us"]["percent"])
            heap = r["peak"][side][0]/1024
            code = int(r["words"][side][0]*4)
            guest = "—" if app=="editor" else f'{r["guest_cycles_per_call"][side][0]/cycles_per_us:.3f}'
            rows.append(f"| {app.title()} | {label} | {times} | {pct} | {heap:,.1f} | {code:,} | {guest} |")
    frontmatter = '---\nTitle: Physical compiler comparisons on the ESP32-P4\nTicket: PICOCALC-COMPILER-LAB\nStatus: complete\nTopics: [picocalc, performance]\nDocType: reference\nIntent: long-term\nOwners: []\nRelatedFiles: []\nExternalSources: []\n---\n'
    return frontmatter+"\n".join(rows)+"\n"


def figure(data,output):
    subset=[r for r in data if r["app"]=="editor"]
    titles=("Cold compile time","Peak compiler heap","Emitted RV32 words")
    keys=("us","peak","words")
    fig,axes=plt.subplots(1,3,figsize=(11.7,4.25),sharey=True,layout="constrained")
    for ax,key,title in zip(axes,keys,titles):
        ax.axvline(0,color="#88949a",lw=1)
        vals=[]
        for i,r in enumerate(subset):
            a,b=r[key]["percent"]
            vals.extend((a,b))
            ax.scatter(a,i-.06,marker="o",s=43,color="#126175",label="Boot 1" if i==0 else None,zorder=3)
            ax.scatter(b,i+.06,marker="D",s=36,facecolors="white",edgecolors="#a74e23",linewidths=1.5,label="Boot 2" if i==0 else None,zorder=3)
        ax.set_title(title,fontsize=12)
        lower=min(vals+[0]); upper=max(vals+[0]); pad=max(0.25,.12*(upper-lower))
        ax.set_xlim(lower-pad,upper+pad)
        ax.set_xlabel("Change from control (%)")
        ax.grid(axis="x",color="#d9dfe0",lw=.55)
        for edge in ("top","right","left"):
            ax.spines[edge].set_visible(False)
        ax.tick_params(axis="y",length=0)
    axes[0].set_yticks(list(range(len(subset))),[r["design"] for r in subset],fontsize=10)
    axes[0].invert_yaxis()
    axes[0].legend(loc="best",fontsize=8)
    fig.suptitle("Editor on the ESP32-P4",fontsize=16,x=.03,ha="left")
    fig.savefig(output,dpi=165)
    plt.close(fig)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence",type=Path,default=EVIDENCE)
    args=parser.parse_args()
    rows=table(args.evidence)
    (args.evidence/"cross-study.json").write_text(json.dumps(rows,indent=2)+"\n")
    (args.evidence/"01-cross-study-table.md").write_text(markdown_table(rows,args.evidence))
    figure(rows,args.evidence/"compiler-design-comparison.png")
