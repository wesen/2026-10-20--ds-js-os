"""Print intern-facing tables describing the completed controlled integration trial."""
import json
import sys
from pathlib import Path

summary=json.loads(Path(sys.argv[1]).read_text())
receipt=json.loads(Path(sys.argv[2]).read_text())
apps=["files","agenda","editor"]


def records(app,base,lane):
    rows=sorted((r for r in summary if r["app"]==app and r["baseline"]==base and r["candidate"]==lane),
                key=lambda r:r["boot"])
    if len(rows)!=2: raise ValueError("expected both boot summaries")
    return rows


def pair(rows,metric,field,scale=1,digits=1):
    return " / ".join(f"{r[metric][field]/scale:,.{digits}f}" for r in rows)


print("## How the changes behave in one compiler\n")
print("The final firmware ran four compilers on the same input sources and the same native reactor per application. Production and the qualified staged compiler identify the two historical reference points. The native arm adds destination-driven conditions, direct checked reads and register homes chosen by local-use counts. The combined arm adds eager cursor scanning with token reuse to that native arm. Every integrated ELF matches the corresponding native-only ELF. Its RISC-V instruction words and guest behavior can therefore serve as controls for a frontend-only change. The separate incremental, bounds, selector and async studies have different inputs or clocks and are reported independently.\n")
print("| App | Production cold ms | Integrated cold ms | Paired cold change % | Peak QuickJS change KiB | Native words, before → after |")
print("| --- | ---: | ---: | ---: | ---: | ---: |")
for app in apps:
    rr=records(app,"base","combined")
    print("| "+" | ".join([app.capitalize(),pair(rr,"us","baseline",1000),pair(rr,"us","candidate",1000),
                           pair(rr,"us","pct"),pair(rr,"peak","change",1024),
                           f"{int(rr[0]['words']['baseline']):,} → {int(rr[0]['words']['candidate']):,}"])+" |")
print("\nEvery slash separates the two physical boots. Time changes and heap changes are medians of within-block differences. Native text reductions were 52.74% for Files, 49.63% for Agenda’s parser and reminders, and 43.14% for Editor. The benchmark used equal reactor reservations. The full output ELF lengths consequently remained equal across arms.\n")
print("![Two-boot changes in compile latency, native text and guest cycles](../various/picocalc-lab2-integrated-results.png)\n")
print("| Directly measured operation | Production cycles per call | Integrated cycles per call | Paired cycle change % | Cold change from adding scanner to native arm % |")
print("| --- | ---: | ---: | ---: | ---: |")
names=["Files directory comparison","Agenda weekday","Editor literal search match"]
for app,name in zip(apps,names):
    rr=records(app,"base","combined");ss=records(app,"native","combined")
    print("| "+" | ".join([name,pair(rr,"cycles","baseline"),pair(rr,"cycles","candidate"),
                           pair(rr,"cycles","pct"),pair(ss,"us","pct")])+" |")
print("\nEach guest batch executes 128 checked calls. Files compares a particular pair of names. Agenda evaluates weekday over a fixed date sequence. Editor matches a specific search query. The chart describes those kernels. A keypress, a redraw or a whole application turn exercises more work than a single kernel.\n")
print("A sensitivity calculation gives one interpretation of the additional cold work. Let ΔC be extra microseconds at build time and ΔG be cycles saved per measured guest call at frequency F hertz. If these calls were the only beneficiary, ΔC × F / (1,000,000 × ΔG) calls would repay the extra compilation. Repeated operations, source edit frequency and changes in other functions determine the application's actual break-even.\n")
for app,name in zip(apps,names):
    rr=records(app,"base","combined")
    values=[]
    for b,r in enumerate(rr):
        hz={x["clock_hz"] for x in receipt["boots"][b]["guest"]}
        if len(hz)!=1: raise ValueError("clock frequency changed in this boot")
        extra=r["us"]["change"]
        saved=-r["cycles"]["change"]
        if saved>0 and extra>0:
            values.append(f"{extra*hz.pop()/1_000_000/saved:,.0f}")
        elif saved>0:
            values.append("already ahead on cold time")
        else:
            values.append("no positive savings in this kernel")
    print(f"- {name} gives {values[0]} / {values[1]} calls or outcomes across the two boots.")
