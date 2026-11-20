"""Recompute function choices from the measured rows and verify the small holdout's upper bound."""
import hashlib
import json
import sys
from functools import cmp_to_key
from pathlib import Path

recorded, rerun, inputs = map(Path,sys.argv[1:])
old=json.loads(recorded.read_text())
fresh=json.loads(rerun.read_text())
assert old["freeze"] == fresh["freeze"]
result={}
fingerprints = set()
for previous,module in zip(old["modules"],fresh["modules"],strict=True):
    for key in ["name","rows","budgets","sourceSha256","eligibleCost"]:
        assert previous[key] == module[key]
    rows=module["rows"]
    name=module["name"]
    assert hashlib.sha256((inputs/name).read_bytes()).hexdigest() == module["sourceSha256"]
    assert all(r["candidate"] for r in rows)
    fingerprints.add(tuple(sorted((r["name"],r["charge"],r["benefit"]) for r in rows)))
    budget=32768
    observed=next(b for b in module["budgets"] if b["budget"]==budget)
    productive=[r for r in rows if r["benefit"]]
    feasible=sum(r["charge"] for r in productive)
    benefit=sum(r["benefit"] for r in productive)
    assert feasible <= budget and benefit==observed["oracle"]
    assert all(r["benefit"]>=0 for r in rows)
    def ranked(a,b):
        score=lambda r:r["literal"]+r["local"]
        ratio=score(b)*a["charge"]-score(a)*b["charge"]
        return ratio or ((a["name"]>b["name"])-(a["name"]<b["name"]))
    ordered={"source":rows,"literal":sorted((r for r in rows if r["literal"]),key=lambda r:r["name"]),
            "density":sorted((r for r in rows if r["literal"]+r["local"]),key=cmp_to_key(ranked))}
    decisions={}
    for policy, order in ordered.items():
        charge=0
        gain=0
        count=0
        for r in order:
            if charge+r["charge"]<=budget:
                charge+=r["charge"]
                gain+=r["benefit"]
                count+=1
        assert [gain] == observed["comparisons"][policy]["words"]
        assert [charge] == observed["comparisons"][policy]["charge"]
        assert gain==module["compiledChecks"][0][policy]["removed"]
        decisions[policy]=dict(charge=charge, gain=gain, count=count)
    result[name]=dict(functions=len(rows),productive=len(productive),oracle=benefit,
                      optimalFeasibleCharge=feasible,plannerCellVisits=module["selectorVisits"],choices=decisions)
assert len(fingerprints)==1 and len(result)==3
print(json.dumps(dict(lock=fresh["freeze"],modules=result),indent=2))
