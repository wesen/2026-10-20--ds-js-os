"""Verify each completed boot against independent clean links and report within-round differences."""
import hashlib
import json
from pathlib import Path
from statistics import median
import sys

host=json.loads(Path(sys.argv[1]).read_text())
names="round position mode edit us load guest before peak size count bytes built reused ret cell0 cell1 rows units columns".split()
result={}
for file in map(Path,sys.argv[2:]):
    lines=file.read_text(errors="replace").splitlines()
    assert "FRAGDONE" in lines
    data={}
    for line in lines:
        if not line.startswith("FRAGROW "):
            continue
        fields=line.split()
        row=dict(zip(names,map(int,fields[1:-1]),strict=True))
        e,m,t=row["edit"],row["mode"],row["round"]
        assert row["position"]==(m-t-e)%3
        assert (t,e,m) not in data
        assert (fields[-1],row["size"]) == (host["rows"][e+1]["elf"],host["rows"][e+1]["bytes"])
        assert [row[k] for k in ["ret","cell0","cell1","rows","units","columns"]]==[0,5,4,3,0,0]
        assert row["before"]<=row["peak"] and 0<row["load"]+row["guest"]<row["us"]
        assert row["built"]+row["reused"]==120
        assert row["bytes"]<=[0,262144,40960][m] and row["count"]<=120
        data[t,e,m]=row
    groups={}
    for e in range(4):
        groups[e]={}
        for m in (1,2):
            baseline=[data[t,e,0] for t in range(3)]
            candidate=[data[t,e,m] for t in range(3)]
            diffs=[a["us"]-b["us"] for a,b in zip(baseline,candidate)]
            groups[e][m]=dict(savingsUs=diffs,medianUs=median(diffs),cleanMedianUs=median(a["us"] for a in baseline),
                              before=median(b["before"] for b in candidate),peak=median(b["peak"] for b in candidate),
                              built=[b["built"] for b in candidate],reused=[b["reused"] for b in candidate])
    assert len(data)==36
    result[file.name]=dict(sha256=hashlib.sha256(file.read_bytes()).hexdigest(),groups=groups)
print(json.dumps(result,indent=2))
