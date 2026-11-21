"""Check a balanced device log against frozen source predictions and score each fixture."""
import argparse,collections,itertools,json,statistics
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument("log",type=Path);p.add_argument("out",type=Path)
args=p.parse_args()
ticket=Path(__file__).resolve().parents[2]
manifest=json.loads((ticket/"various/director/host-images.json").read_text())
rows=[];cold=[]
for line in args.log.read_text(errors="replace").splitlines():
    if line.startswith("DSERROR"): raise ValueError(line)
    if line.startswith("DSROW "):rows.append(json.loads(line[6:]))
    if line.startswith("DSCOLD "):cold.append(json.loads(line[7:]))
labels=["stock","scalar","pie","auto"]; families=["short","long","dynamic"]
by={}
for r in rows:
    key=(r["fixture"],r["reach"],r["block"],r["arm"])
    assert key not in by and r["calls"]>0 and r["cycles"]>0
    by[key]=r
assert len(rows)==270 and len(cold)==48
cases=[]
for f,(family,n) in enumerate([("short",8),("long",96),("dynamic",3),("dynamic",17),("dynamic",96)]):
    for reach in (0,35,96):
        case,=[c for c in manifest["cases"] if c["label"]==family and c["n"]==n and c["reach"]==reach]
        samples={}
        for arm in range(3):
            blocks=[by[f,reach,b,arm] for b in range(6)]
            assert all(r["n"]==n and r["value"]==case["expected"] for r in blocks)
            samples[labels[arm]]=[r["cycles"]/r["calls"] for r in blocks]
        times={a:statistics.median(v) for a,v in samples.items()}
        best=min(times,key=times.get); win=times[best]; pred=case["plan"]
        cases.append(dict(family=family,n=n,reach=reach,predicted=pred,best=best,medianCycles=times,
                          regretPct=100*(times[pred]/win-1),regretStockPct=100*(times["stock"]/win-1)))
seen=set();grouped=collections.defaultdict(dict)
for r in cold:
    key=(r["family"],r["arm"],r["block"])
    assert key not in seen and r["match"] and r["totalUs"]>r["compileUs"]>0
    seen.add(key)
    assert r["bytes"]==manifest["compiled"][families[r["family"]]][labels[r["arm"]]]["len"]
    grouped[r["family"],r["arm"]][r["block"]]=r
cost={}
for f,name in enumerate(families):
    cost[name]={}
    for a,label in enumerate(labels):
        g=grouped[f,a]; assert sorted(g)==[0,1,2,3]
        cost[name][label]={k:statistics.median([r[k] for r in g.values()]) for k in ["compileUs","totalUs","peakBytes"]}
    cost[name]["autoMinusForcedPieUsPaired"]=statistics.median([grouped[f,3][b]["compileUs"]-grouped[f,2][b]["compileUs"] for b in range(4)])
result={"metric":"cycles per call in P4 flash-resident held-out code; regret against fastest median per input",
        "winnerCount":sum(r["predicted"]==r["best"] for r in cases),
        "medianRegretPct":statistics.median(r["regretPct"] for r in cases),
        "worstRegretPct":max(r["regretPct"] for r in cases),"cases":cases,
        "cold":"four rotated blocks, fresh QuickJS runtime with SPIRAM allocator for each observation",
        "coldMedians":cost}
args.out.mkdir(parents=True,exist_ok=True)
for file,v in [("selector-device-rows",rows),("selector-cold-rows",cold),("selector-result",result)]:
    (args.out/(file+".json")).write_text(json.dumps(v,indent=2)+"\n")
print(result["winnerCount"],"/",len(cases),"median regret",result["medianRegretPct"],"worst",result["worstRegretPct"])
for c in cases:print(c["family"],c["n"],c["reach"],c["best"],round(c["regretPct"],1))
print(cost)
