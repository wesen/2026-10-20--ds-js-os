"""Recompute within-boot comparisons from the unabridged serial capture and host oracle."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re
from statistics import median

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("work", type=Path)
args = parser.parse_args()
oracle = json.loads((args.work / "oracle.json").read_text())
lanes = list(oracle)
apps = ["files", "agenda", "editor"]
observations = {}
guest = defaultdict(dict)
hashes = {}
positions = Counter()
seen = Counter()
for boot in (1, 2):
    path = args.work / f"boot-{boot}.log"
    hashes[path.name] = sha256(path.read_bytes()).hexdigest()
    lines = path.read_text(errors="replace").splitlines()
    pending = None
    assert "LABDONE" in lines
    for line in lines:
        if m := re.fullmatch(r"LABRUN (\d+) (\d+) (\w+) (\w+)", line):
            assert pending is None
            block, position, lane, app = m.groups()
            pending = (boot, int(block), lane, app)
            assert pending not in observations
            positions[boot, app, lane, int(position)] += 1
            seen[boot, int(block), lane, app] += 1
            streamed = False
            value = None
        elif pending and line == f"{app} native compiler functions=streamed":
            streamed = True
        elif pending and (m := re.fullmatch(app+r" compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)",line)):
            assert streamed and value is None
            value = tuple(map(int,m.groups()))
        elif pending and line.startswith("LABHASH"):
            key, label, guest_app, digest = line.split()
            assert (label,guest_app) == (lane,app)
            assert digest == oracle[lane][app]["sha256"] and value[2] == oracle[lane][app]["bytes"]
            observations[pending] = value
            pending = None
        elif m := re.fullmatch(r"LABGUEST (\w+) (\d+) (\w+) (\d+) (\d+) (\d+)",line):
            routine,batch,label,n,cycles,hz = m.groups()
            point = (boot,int(batch),routine)
            assert label not in guest[point] and int(hz) == 360000000 and int(n) == 128
            guest[point][label] = int(cycles)
    assert pending is None
    blocks = {k[1] for k in seen if k[0] == boot}
    for app in apps:
        if "cursor_reuse" in lanes:
            assert len({oracle[lane][app]["sha256"] for lane in lanes})==1
        if "observe" in lanes:
            assert oracle["observe"][app]["sha256"] == oracle["base"][app]["sha256"]
        assert len({oracle[lane][app]["sourceSha256"] for lane in lanes})==1
        assert len({oracle[lane][app]["reactorSha256"] for lane in lanes})==1
        for lane in lanes:
            for block in blocks:
                assert seen[boot,block,lane,app]==1
            counts = [positions[boot,app,lane,i] for i in range(len(lanes))]
            assert all(counts) and len(set(counts))==1

def summary(values):
    return dict(pairs=len(values), median=median(values), min=min(values), max=max(values),
                positive=sum(v>0 for v in values), negative=sum(v<0 for v in values))

contrasts = {k:{"base":1,k:-1} for k in lanes if k!="base"}
if "regex_reuse" in lanes:
    contrasts.update(scanner_reuse={"regex_reuse":1,"cursor_reuse":-1},
                     lifetime_cursor={"cursor_fresh":1,"cursor_reuse":-1},
                     interaction={"regex_reuse":1,"cursor_reuse":-1,"base":-1,"cursor_fresh":1})
if "cursor_lazy" in lanes:
    contrasts["lazy_added"]={"cursor_reuse":1,"cursor_lazy":-1}
if "staged" in lanes and "combined" in lanes:
    contrasts["staged_to_combined"]={"staged":1,"combined":-1}
by_app={}
for app in apps:
    by_app[app]={}
    for label,weights in contrasts.items():
        item={}
        for metric,idx in [("us",0),("peakBytes",1)]:
            values={boot:[sum(w*observations[boot,b,lane,app][idx] for lane,w in weights.items())
                          for b in sorted({k[1] for k in observations if k[0]==boot})] for boot in (1,2)}
            item[metric]=dict(**summary(values[1]+values[2]), bootMedians=list(map(median,values.values())))
        by_app[app][label]=item
routines={}
for routine in sorted({key[2] for key in guest}):
    assert {(boot,batch) for boot,batch,r in guest if r==routine} == {
        (boot,batch) for boot in (1,2) for batch in range(16)}
    g=[row for key,row in guest.items() if key[2]==routine]
    assert all(set(row)==set(lanes) for row in g)
    routines[routine]={l:summary([row["base"]-row[l] for row in g]) for l in lanes if l!="base"}
print(json.dumps(dict(captures=hashes, rows=len(observations), oracleSha256=sha256((args.work/"oracle.json").read_bytes()).hexdigest(),
                      comparisons=by_app, guestBatchCycleSavings=routines),indent=2))
