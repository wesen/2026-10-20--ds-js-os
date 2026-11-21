#!/usr/bin/env python3
"""Count records starting with LLVM's explicit loop section marker in each real middle stream."""
import gzip
import hashlib
import json
from pathlib import Path

src=(Path(__file__).resolve().parents[2]/"PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/various/llvm-pipeline")
manifest=json.loads((src/"manifest.json").read_text())
report={}
for variant,streams in manifest.items():
    index=json.loads(gzip.decompress((src/f"{variant}-middle.index.json.gz").read_bytes()))
    raw=gzip.decompress((src/f"{variant}-middle.log.gz").read_bytes())
    digest=hashlib.sha256(raw).hexdigest()
    assert digest==streams["middle"]["sha256"]
    matches=[]
    for i,item in enumerate(index):
        end=index[i+1]["offset"] if i+1<len(index) else len(raw)
        lines=raw[item["offset"]:end].splitlines()
        marker=next((line for line in lines[1:] if line.strip()),b"")
        if marker==b"; Preheader:":
            matches.append(i)
    report[variant]={"sha256":digest,"withExplicitPreheader":len(matches),"exampleOrdinal":matches[0]}
print(json.dumps(report, indent=2))
