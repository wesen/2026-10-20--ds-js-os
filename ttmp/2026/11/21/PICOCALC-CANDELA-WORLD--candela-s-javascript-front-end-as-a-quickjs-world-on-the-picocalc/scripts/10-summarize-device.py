"""Summarize a device run of the Candela world (08-run-device.py) against the Node reference.

usage: python3 -I 10-summarize-device.py RUN_DIR NODE_REFERENCE.json [--out SUMMARY.json]

Reads RUN_DIR/cw.jsonl (records tagged with the plan step that produced them) and prints: module loads (one per
fresh runtime), B-01 cold and warm builds, every suite scene with its digest agreement (15 digests: WGSL, the six
arrays of pack at t = 0 and at t = 2.5, frame uniforms, sections; plus the fixed kernel), the heap and C stack
maxima, parameter re-packs with their segment time against the 50 ms turn, the static rebuild, heap across ten
rebuilds, and the diagnostic probes. Writes the same as JSON with --out.
"""
import json
import statistics
import sys
from pathlib import Path

ARRAYS = ["U", "O", "LI", "BV", "SDs", "SDd"]


def digests(node, rec):
    if not rec.get("wgsl"):
        return 0, ["no build output"]
    pairs = [("wgsl", rec["wgsl"]["sha256"], node["wgsl"]["sha256"])]
    pairs += [("pack0." + k, rec["pack0"][k]["sha256"], node["pack0"][k]["sha256"]) for k in ARRAYS]
    if "packT" in rec:
        pairs += [("packT." + k, rec["packT"][k]["sha256"], node["packT"][k]["sha256"]) for k in ARRAYS]
    pairs += [("frameU160", rec.get("frameU160"), node["frameU160"]), ("sections", rec["sections"]["sha256"], node["sections"]["sha256"])]
    return len(pairs), [w for w, a, b in pairs if a != b]


def main():
    args = sys.argv[1:]
    out = None
    if "--out" in args:
        i = args.index("--out"); out = args[i + 1]; del args[i:i + 2]
    run, ref = Path(args[0]), json.load(open(args[1]))
    recs = [json.loads(l) for l in (run / "cw.jsonl").read_text().splitlines() if l.strip()]
    by_step = {}
    for r in recs:
        by_step.setdefault(r["step"], []).append(r)
    final = lambda step, ev: next((r for r in reversed(by_step.get(step, [])) if r.get("ev") == ev), None)
    S = {"run": json.loads((run / "run.json").read_text())}

    S["loads"] = [dict(step=s, **{k: r[k] for k in ("ms", "readMs", "steps", "modules", "bytecodeBytes", "heap")})
                  for s in sorted(by_step) if s.startswith("load-") for r in [final(s, "load")] if r]
    print("module load (fresh runtime):")
    for l in S["loads"]:
        print(f"  {l['step']}: {l['ms']} ms (JS_ReadObject {l['readMs']} ms), {l['modules']} modules, {l['bytecodeBytes']} B, "
              f"heap {l['heap']['before']} -> {l['heap']['after']} (peak {l['heap']['peak']})")

    keys = ("buildMs", "candelaMs", "compileMs", "pack0Ms", "packTMs", "frameMs", "splitMs", "subsetMs", "stackBytes", "packStackBytes", "steps", "compileSteps")
    S["b01"] = []
    for s in sorted(by_step):
        if s.startswith("b01-cold-") or s.startswith("b01-warm-"):
            r = final(s, "build")
            if r:
                S["b01"].append({"step": s, **{k: r.get(k) for k in keys}, "heap": r["heap"]})
    print("B-01:")
    for b in S["b01"]:
        print(f"  {b['step']}: build {b['buildMs']} ms, compile {b['compileMs']} ms, pack0 {b['pack0Ms']} ms, packT {b['packTMs']} ms, "
              f"stack {b['stackBytes']}/{b['packStackBytes']} B, heap peak {b['heap']['peak']} (+{b['heap']['peakDelta']})")

    rows = []
    for sid, node in ref["scenes"].items():
        step = "suite-" + sid
        r = final(step, "build")
        fault = final(step, "fault")
        timeout = final(step, "timeout")
        if r is None:
            rows.append({"id": sid, "status": "fault" if fault else "timeout" if timeout else "not run",
                         "why": (fault or {}).get("why")}); continue
        n, diffs = digests(node, r)
        fixed = r.get("fixedKernel") == ref["fixedKernelSha256"]
        rows.append({"id": sid, "status": "equal" if not diffs and fixed else "differs", "digests": n, "diffs": diffs,
                     "fixedKernel": fixed, "ok": r.get("ok"), **{k: r.get(k) for k in keys}, "heapPeak": r["heap"]["peak"],
                     "peakDelta": r["heap"]["peakDelta"], "hostMs": r.get("hostMs")})
    S["suite"] = rows
    print("suite:")
    for x in rows:
        if "digests" in x:
            print(f"  {x['id']:6} {x['status']:8} {x['digests']} digests  build {x['buildMs']} ms  compile {x['compileMs']} ms  pack0 {x['pack0Ms']} ms  "
                  f"stack {x['stackBytes']}  peak {x['heapPeak']}  {' '.join(x['diffs'])}")
        else:
            print(f"  {x['id']:6} {x['status']:8} {x.get('why') or ''}")
    built = [x for x in rows if "digests" in x]
    S["suiteTotals"] = {"scenes": len(rows), "built": len(built), "equal": sum(x["status"] == "equal" for x in built),
                        "maxBuildMs": max((x["buildMs"] for x in built), default=None),
                        "maxHeapPeak": max((x["heapPeak"] for x in built), default=None),
                        "maxStackBytes": max((x["stackBytes"] for x in built), default=None),
                        "maxPackStackBytes": max((x["packStackBytes"] for x in built), default=None)}
    print("  ", S["suiteTotals"])

    params = []
    for s in by_step:
        r = final(s, "param")
        if r:
            params.append({"step": s, **{k: r.get(k) for k in ("id", "param", "static", "long", "value", "packMs", "updateMs", "repackMs", "segmentMs", "totalMs", "totalSteps", "buildMs")}})
        r = final(s, "time")
        if r:
            params.append({"step": s, "param": "time", "static": False, "value": r.get("time"),
                           **{k: r.get(k) for k in ("id", "long", "packMs", "updateMs", "repackMs", "segmentMs")}})
    S["params"] = params
    print("parameters:")
    for p in params:
        print(f"  {p['step']}: {p['param']}={p['value']} static={p['static']} long={p.get('long')} pack {p['packMs']} ms, repack {p['repackMs']} ms, "
              f"segment {p['segmentMs']} ms, total {p.get('totalMs')} ms")
    dyn = [p for p in params if not p["static"] and p["step"].startswith("b01p-") and p["param"] != "time"]
    if dyn:
        S["b01pRepack"] = {"n": len(dyn), "segmentMsMax": max(p["segmentMs"] for p in dyn), "segmentMsMedian": statistics.median(p["segmentMs"] for p in dyn),
                           "packMsMedian": statistics.median(p["packMs"] for p in dyn), "within50": all(p["segmentMs"] < 50 for p in dyn)}
        print("  B-01p:", S["b01pRepack"])

    rb = [r for r in by_step.get("rebuilds-b01", []) if r.get("ev") == "build"]
    S["rebuilds"] = [{"buildMs": r["buildMs"], "heapAfter": r["heap"]["after"], "heapPeak": r["heap"]["peak"]} for r in rb]
    if rb:
        print("rebuilds:", [x["heapAfter"] for x in S["rebuilds"]], "build ms", [x["buildMs"] for x in S["rebuilds"]])

    probes = {}
    for s in by_step:
        if s.startswith("probe-"):
            r = final(s, "build")
            if r:
                probes[s[6:]] = {"diags": [f"{d['code']}@{d.get('loc')}" for d in r.get("diags", [])],   # loc is "file:line" in records
                                 "refused": [f"{d['code']}@{d.get('loc')} {d.get('feature', '')}".strip() for d in r.get("refused", [])]}
    S["probes"] = probes
    for k, v in probes.items():
        print(f"  probe {k}: {' '.join(v['diags'])} {' '.join(v['refused'])}")
    faults = [r for r in recs if r.get("ev") == "fault"]
    S["faults"] = [{"step": r["step"], "why": r.get("why"), "mem_kb": r.get("mem_kb")} for r in faults]
    print("faults:", S["faults"])
    if out:
        Path(out).write_text(json.dumps(S, indent=1) + "\n")


if __name__ == "__main__":
    main()
