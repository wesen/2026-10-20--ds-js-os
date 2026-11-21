"""Summarize per-block cycle changes and fresh-compiler trials without raw UART."""
from collections import defaultdict
import json
from pathlib import Path
from statistics import median
import sys

raw, output = map(Path, sys.argv[1:])
data = json.loads(raw.read_text())
assert data["restoreReadback"] and data["restoredPainter"]["installed"]
assert len(data["restoredWorlds"]) == 8 and not data["restoredPainter"]["rejects"]

def distribution(values):
    return {"min":min(values),"median":median(values),"max":max(values)}

def losses_pct(stock, candidate):
    assert len(stock) == len(candidate)
    return [100*(1-c/s) for s,c in zip(stock,candidate)]

native = {}
for endpoint, arms in data["nativeBatchCycles"].items():
    native[endpoint] = {name:{
        "cyclesPerCall":distribution([x/256 for x in samples]),
        "pairedTimeReductionPct":distribution(losses_pct(arms["stock"],samples))
    } for name,samples in arms.items()}
compile = defaultdict(lambda:defaultdict(list))
for row in data["compileSamples"]:
    assert row["status"] == "ok"
    compile[row["world"]][row["arm"]].append(row)
cold = {}
balanced = min(len(values) for arms in compile.values() for values in arms.values())
for app, arms in compile.items():
    stock = [s["us"] for s in arms["stock"][:balanced]]
    cold[app] = {}
    for arm, samples in arms.items():
        samples = samples[:balanced]
        times = [s["us"] for s in samples]
        cold[app][arm] = {"compileMillis":distribution([x/1000 for x in times]),
            "pairedTimeReductionPct":distribution(losses_pct(stock,times)),
            "peakJsBytes":distribution([s["peakJsBytes"] for s in samples]),
            "reactorBytes":list(set(s["linkedBytes"] for s in samples))}
output.write_text(json.dumps({"native":native,"cold":cold,"settings":data["settings"],
    "nativeChecked":data["nativeChecked"],"coldBlocksUsed":balanced,"compileRowsCaptured":len(data["compileSamples"])},indent=2)+"\n")
