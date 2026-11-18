"""Validate physical A/B samples, their raw progress logs, module digests and operating conditions."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
from statistics import median

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
args = parser.parse_args()
ledger = next(Path("ttmp/2026/11/17").glob("*CJI-PORT--*/various/device-catalog-results.json"))
catalog = {w["world"]: w for w in json.loads(ledger.read_text())["worlds"]}
rows = [json.loads(line) for line in (args.directory / "p4-runs.jsonl").read_text().splitlines()]
groups = defaultdict(list)
identities = set()
run_summary = []
for r in rows:
    target = catalog[r["world"]]
    raw = (args.directory / r["raw_log"]).read_text()
    expected = hashlib.sha256((Path("picocalc-os/js") / target["file"]).read_bytes()).hexdigest()
    if (r["result"] != "ok" or not r["verified"] or r["source_sha256"] != expected
            or r["elf_sha256"] != target["host_elf_sha256"]
            or r["frontend_reserved_bytes"] != r["requested_heap_mib"] * 1024**2):
        raise ValueError(f"unqualified receipt: {r['raw_log']}")
    metrics = r["metrics"]
    if not metrics["complete"] or not 0 <= metrics["gc_us"] <= metrics["frontend_us"] <= 1000*r["elapsed_ms"]+999:
        raise ValueError(f"invalid nested intervals: {r['raw_log']}")
    phases = [(p, int(t)) for p,t in re.findall(r"cji: progress src="+expected[:8]+r" phase=(\w+) elapsed_ms=(\d+)",raw)]
    transitions = [p for i,(p,t) in enumerate(phases) if i == 0 or phases[i-1][0] != p]
    if transitions != ["load","frontend","link","assemble","assembled"]:
        raise ValueError(f"incomplete progress timeline: {r['raw_log']}: {transitions}")
    memory = {stage: dict(elapsed_ms=int(t),free=int(free),largest=int(largest)) for stage,t,free,largest in
              re.findall(r"^cji: (begin|relocated|assembled|released) elapsed_ms=(\d+) psram_free=(\d+) psram_largest=(\d+)",raw,re.M)}
    if len(memory) != 4:
        raise ValueError(f"incomplete memory timeline: {r['raw_log']}")
    identities.add((r["firmware_sha256"],r["condition"]))
    groups[r["world"],r["requested_heap_mib"]].append(r)
    run_summary.append(dict(world=r["world"], mib=r["requested_heap_mib"], ordinal=r["ordinal"],
                            progress_samples=len(phases), memory=memory, gc_fraction=metrics["gc_us"]/metrics["frontend_us"]))
if len(identities) != 1:
    raise ValueError("expected one verified firmware and board condition")
firmware, condition = identities.pop()
result = dict(firmware_sha256=firmware, condition=condition, runs=run_summary)
if ("agenda",8) in groups and ("agenda",10) in groups:
    baseline = groups["agenda",8]
    candidate = groups["agenda",10]
    def median_value(group, key):
        return median(r[key] if key in r else r["metrics"][key] for r in group)
    result["agenda_10_vs_8"] = dict(n_8=len(baseline),n_10=len(candidate),median_delta_percent={
        key: 100*(median_value(candidate,key)/median_value(baseline,key)-1)
        for key in ["frontend_us","gc_us","elapsed_ms","collections","survivor_bytes","slide_bytes","scratch_bytes"]})
print(json.dumps(result,indent=2))
