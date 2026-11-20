"""Summarize measured P4 medians and host compile observations."""
import json
from pathlib import Path
from statistics import median
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ticket=Path(__file__).resolve().parents[2]
folder=ticket/"various"
p=json.loads((folder/"physical.json").read_text())
cold=json.loads((folder/"director-host-compile.json").read_text())["results"]
arms=[("stock","Stock scalar","#626973"),("portable","Guarded scalar","#287d80"),("pie","Guarded PIE","#ab3721")]
sizes=sorted({r["vertices"] for r in p["cyclesPerCall"]})
loops={a:{r["vertices"]:r["median"] for r in p["cyclesPerCall"] if r["arm"]==a} for a,_,_ in arms}
fig,(ax,bx)=plt.subplots(1,2,figsize=(10.6,4.4),gridspec_kw={"width_ratios":[1.3,1]})
# Categorical spacing preserves the 7 to 8 vertex threshold in print.
for arm,label,color in arms:
    ax.plot(range(len(sizes)),[loops[arm][n]/n for n in sizes],marker="o",lw=2.2,color=color,label=label)
ax.set_xticks(range(len(sizes)),sizes)
ax.set_xlabel("Vertices in a call")
ax.set_ylabel("Median measured cycles / vertex")
ax.set_title("Work per transformed vertex",loc="left")
ax.legend(frameon=False)
x=list(range(len(arms)))
vals=[loops[a][256] for a,_,_ in arms]
bx.barh(x,vals,color=[c for _,_,c in arms]); bx.invert_yaxis()
bx.set_yticks(x,[n for _,n,_ in arms]); bx.set_xlim(0,max(vals)*1.26)
for i,v in enumerate(vals):bx.text(v+400,i,f"{v:,}",va="center",fontsize=10)
bx.set_xlabel("Median measured cycles / call")
bx.set_title("256 vertices on the ESP32-P4",loc="left")
for axis in (ax,bx):
    axis.spines[["top","right"]].set_visible(False)
fig.tight_layout(pad=1.2)
fig.savefig(folder/"projection-cost.png",dpi=160)
for name in dict.fromkeys(r["app"] for r in cold):
    print(name,end=" ")
    for a in ["stock","pie"]:
        rr=[r for r in cold if r["mode"]==a and r["app"]==name]
        print(a, "total",round(median(r["totalMs"] for r in rr),2),"compile",round(median(r["compileMs"] for r in rr),2), "sel",rr[0]["selected"],"bytes",rr[0]["bytes"],end="; ")
    print()
