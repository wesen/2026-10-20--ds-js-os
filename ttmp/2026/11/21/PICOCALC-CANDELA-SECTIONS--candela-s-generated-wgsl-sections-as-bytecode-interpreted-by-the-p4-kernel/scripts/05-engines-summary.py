#!/usr/bin/env python3
"""05-engines-summary.py: compare 04-qjs-translate.mjs runs of the same exports in several JavaScript engines.

usage: python3 -I 05-engines-summary.py EXPORT_DIR OUT.json NAME=LOG:HEXDIR ...

Each LOG holds the '@@' JSON lines of one engine and HEXDIR its blobs. Checks that every engine produced the same
bytes for every preset, and equal to EXPORT_DIR/<ID>/prog.cdvm (02-translate-all.mjs), and summarises the
translation cost per engine: total, median and largest warm CPU milliseconds, and interpreter steps where known."""
import json
import os
import statistics
import sys

export, out, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
engines = {}
for s in specs:
    name, rest = s.split("=", 1)
    log, hexdir = rest.split(":", 1)
    rows = [json.loads(l[2:]) for l in open(log) if l.startswith("@@")]
    engines[name] = (rows, hexdir)
ids = sorted({r["id"] for rows, _ in engines.values() for r in rows})
mismatch = []
for i in ids:
    ref = open(os.path.join(export, i, "prog.cdvm"), "rb").read()
    for name, (rows, hexdir) in engines.items():
        p = os.path.join(hexdir, i + ".hex")
        if not os.path.exists(p) or bytes.fromhex(open(p).read().strip()) != ref:
            mismatch.append((name, i))
summary = {"presets": len(ids), "mismatches": mismatch, "engines": {}}
for name, (rows, _) in engines.items():
    ok = [r for r in rows if r["ok"]]
    warm = [r["warmMs"] for r in ok]
    big = max(ok, key=lambda r: r["warmMs"])
    e = {"translated": len(ok), "totalWarmMs": round(sum(warm), 1), "medianWarmMs": round(statistics.median(warm), 2),
         "largest": {"id": big["id"], "warmMs": big["warmMs"], "wgslBytes": big["wgslBytes"], "bytes": big["bytes"]}}
    steps = [r["warmSteps"] for r in ok if isinstance(r.get("warmSteps"), (int, float)) and r["warmSteps"] == r["warmSteps"]]
    if steps:
        e["medianSteps"] = statistics.median(steps)
        e["maxSteps"] = max(steps)
    summary["engines"][name] = e
json.dump(summary, open(out, "w"), indent=1)
print(json.dumps(summary))
