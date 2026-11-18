"""Generate the report figures from ticket receipts. Run from any directory."""
import json
from pathlib import Path
import re
import subprocess
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).resolve().parent
ticket = here.parents[1]
out = ticket / "various/figures"
out.mkdir(exist_ok=True)
for name in ("compiler-paths","memory-layout"):
    subprocess.run(["dot","-Tpng","-Gdpi=130",str(here/f"{name}.dot"),"-o",str(out/f"{name}.png")],check=True)
plt.rcParams.update({"font.size":10, "axes.spines.right":False, "axes.spines.top":False,
                     "axes.titlelocation":"left", "figure.facecolor":"white","savefig.dpi":150})
baseline = json.loads((ticket/"various/compiler-baseline.json").read_text())
p4 = [json.loads(x) for x in (ticket/"various/p4/p4-runs.jsonl").read_text().splitlines()]
linux = {(r["world"],r["heap_bytes"]//1024**2):r for r in baseline["host_timing"] if r["variant"]=="measured"}
fig, axes = plt.subplots(1,2,figsize=(10,4.4),layout="constrained")
for ax,platform in zip(axes,["Linux AOT","Physical P4"]):
    for i,row in enumerate(p4):
        world, mib = row["world"],row["requested_heap_mib"]
        host = linux[world,mib]
        if platform=="Linux AOT":
            total,gc = host["frontend_us"]["median"]/1e6,host["gc_us"]["median"]/1e6
        else:
            total,gc = row["metrics"]["frontend_us"]/1e6,row["metrics"]["gc_us"]/1e6
        ax.barh(i,total-gc,color="#246383")
        ax.barh(i,gc,left=total-gc,color="#df963c")
        ax.annotate(f"{total:.2f} s",(total,i),xytext=(4,0),textcoords="offset points",va="center",fontsize=9)
    ax.set_yticks(range(len(p4)),[f"{r['world'].title()}  {r['requested_heap_mib']} MiB" for r in p4])
    ax.invert_yaxis()
    ax.set_title(platform + (" · median of 7" if platform=="Linux AOT" else " · one run per case"))
    ax.set_xlabel("Frontend seconds")
    ax.margins(x=.28)
fig.suptitle("Time inside the compiler frontend",fontweight="bold")
fig.legend(["Other frontend work","Garbage collection"], loc="outside lower center", ncol=2, frameon=False)
fig.savefig(out/"frontend-times.png")
plt.close(fig)

fig,ax = plt.subplots(figsize=(9,4.1),layout="constrained")
colors=["#246383","#bc6430","#208267"]
for row,color in zip(p4,colors):
    raw=(ticket/"various/p4"/row["raw_log"]).read_text()
    points=re.findall(r"phase=frontend elapsed_ms=(\d+) allocs=(\d+) scratch=(\d+)",raw)
    ax.plot([int(t)/60000 for t,_,_ in points],[int(a) for _,a,_ in points],
            label=f"{row['world'].title()}, {row['requested_heap_mib']} MiB",color=color,lw=2)
ax.set(xlabel="Minutes since job start",ylabel="Job allocator calls in frontend",title="What the 10-second heartbeats reveal")
ax.legend(frameon=False); ax.grid(axis="y",alpha=.2)
fig.savefig(out/"frontend-heartbeats.png")
plt.close(fig)

fig,axes=plt.subplots(1,2,figsize=(10,4.5),layout="constrained")
for ax,key,label in zip(axes,["native","rv32"],["Linux x86-64","Emulated RV32"]):
    data=baseline["worlds"]["files"][key]
    rows=data["top"][:6]
    ax.barh([r["symbol"] for r in rows],[r["instructions"]/1e9 for r in rows],color="#246383")
    ax.invert_yaxis(); ax.set_xlabel("Billions of instructions"); ax.set_title(label); ax.grid(axis="x",alpha=.2)
fig.suptitle("Files compiler · highest instruction counts by symbol",fontweight="bold")
fig.savefig(out/"files-hotspots.png")
plt.close(fig)
