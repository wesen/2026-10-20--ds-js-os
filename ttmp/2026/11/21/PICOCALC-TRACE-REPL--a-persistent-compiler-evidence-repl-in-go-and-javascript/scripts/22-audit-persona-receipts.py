#!/usr/bin/env python3
"""Compare visible persona answers with independently read compiler files.

A true flag is a lexical match. A supervisor must inspect units, direction and
the referenced tool responses before awarding a task.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROW_TICKET = HERE.parent.parent / "PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes"

def read_ground_truth():
    base = ROW_TICKET / "various"
    pipeline = base / "llvm-pipeline"
    manifest = json.loads((pipeline / "manifest.json").read_text())
    index_path = pipeline / "checked-middle.index.json.gz"
    indexes = json.loads(gzip.decompress(index_path.read_bytes()))
    raw = gzip.decompress((pipeline / "checked-middle.log.gz").read_bytes())
    assert hashlib.sha256(raw).hexdigest() == manifest["checked"]["middle"]["sha256"]
    prev = None
    for ordinal, record in enumerate(indexes):
        start = record["offset"]
        end = indexes[ordinal+1]["offset"] if ordinal+1 < len(indexes) else len(raw)
        body = re.search(rb"^define [^\n]*@row\(.*?^}", raw[start:end], re.M | re.S)
        if body is None:
            prev = None
            continue
        direct = len(re.findall(rb"load i32, ptr %work,", body.group(0)))
        if prev is not None and direct < prev:
            change = [ordinal-1, ordinal, prev, direct]
            break
        prev = direct
    else:
        raise ValueError("no observed change in archive")
    execution = json.loads((base / "passes/execution.json").read_text())
    before, after = [execution[arm]["totals"]["instructions"] for arm in ("checked-llc-nolsr", "checked-llc")]
    backend = gzip.decompress((pipeline / "checked-backend.log.gz").read_bytes())
    assert hashlib.sha256(backend).hexdigest() == manifest["checked"]["backend"]["sha256"]
    backend_index = json.loads(gzip.decompress((pipeline / "checked-backend.index.json.gz").read_bytes()))
    positions = [i for i, event in enumerate(backend_index) if "Virtual Register Rewriter" in event["header"]]
    return {
        "allocator": {"first": positions[0], "last": positions[1], "property":"NoVRegs"},
        "catalog": {"overall": sum(p["dumps"] for v in manifest.values() for p in v.values()),
                    "checkedMiddle": manifest["checked"]["middle"]["dumps"],
                    "checkedBackend": manifest["checked"]["backend"]["dumps"],
                    "witnessPass": "EarlyCSEPass", "ordinal":74},
        "pass": {"left":change[0], "right":change[1], "beforeCount":change[2], "afterCount":change[3],
                 "sourcePass": "SROA", "destinationPass":"EarlyCSE"},
        "ablation": {"off": before, "on": after, "differenceMagnitude": before-after}
    }

def packet(reply):
    try:
        return json.loads(reply)
    except (json.JSONDecodeError, TypeError):
        return {}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path, nargs="+")
    args = parser.parse_args()
    keys = read_ground_truth()
    for path in args.receipt:
        r = json.loads(path.read_text())
        card = r["card"]
        answer = re.sub(r"(?<=\d)[,_\u202f](?=\d)", "", r["answer"])
        checks = {name: bool(re.search(r'(?<!\d)'+str(want)+r'(?!\d)', answer))
                  if isinstance(want, int) else want.casefold() in answer.casefold()
                  for name, want in keys[card].items()}
        results = [packet(s.get("reply","")) for s in r["steps"]]
        eval_errors = sum(p.get("ok") is False or bool(s.get("error")) for p,s in zip(results,r["steps"]))
        traces = [s["source"] for s in r["steps"] if s.get("tool") == "trace_eval"]
        print(json.dumps({"file": path.name, "model": r.get("observedModel"),
                          "calls": len(r["steps"]), "failedCalls": eval_errors,
                          "identicalRepeatedCalls": len(traces)-len(set(traces)),
                          "checks": checks, "providerErrors": r["errors"]}))
if __name__ == "__main__":
    main()
