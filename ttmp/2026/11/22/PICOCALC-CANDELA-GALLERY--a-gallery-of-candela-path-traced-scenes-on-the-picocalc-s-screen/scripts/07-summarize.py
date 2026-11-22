#!/usr/bin/env python3
"""07-summarize.py: the device run's per-scene timings and its digests against the host references.

usage: python3 -I 07-summarize.py RUN_DIR HOST.jsonl RV32.jsonl OUT.json [--md OUT.md]

RUN_DIR is 06-run-device.py's output (uart.log is read; every "CGAL {...}" line counts, wherever it arrived).
HOST.jsonl is 04-build-ref.py host's output and RV32.jsonl its rv32 output, both at the device run's digest passes.
Per scene: the scene record of the "scenes" step (time to first image, coarse and half images, first full pass, seconds
per pass, samples per second, cycles per sample, displays, peak heap), the pass records (seconds per later pass), and
the digest record next to the references: frame 0, accumulation and display digests, equal or not."""
import json
import re
import statistics
import sys
from pathlib import Path


def records(log):
    out = []
    for raw in log.read_bytes().decode(errors="replace").splitlines():
        m = re.search(r"CGAL (\{.*\})\s*$", raw)
        if m:
            try:
                out.append(json.loads(m[1]))
            except json.JSONDecodeError:
                pass
    return out


def main():
    a = sys.argv[1:]
    md = None
    if "--md" in a:
        i = a.index("--md"); md = Path(a[i + 1]); del a[i:i + 2]
    if len(a) != 4:
        sys.exit(__doc__)
    run, host, rv32, out = Path(a[0]), Path(a[1]), Path(a[2]), Path(a[3])
    recs = records(run / "uart.log")
    hostr = {r["id"]: r for r in map(json.loads, host.read_text().splitlines()) if "id" in r}
    rvr = {r["id"]: r for r in map(json.loads, rv32.read_text().splitlines()) if "id" in r}
    order = list(dict.fromkeys(r["id"] for r in recs if r.get("ev") == "scene-list"))
    scenes, digests = {}, {}
    for r in recs:
        if r.get("ev") == "scene" and r.get("reason") in ("chosen", "next", "previous", "time", "target", "digest") and r.get("passes", 0) >= 1:
            scenes.setdefault(r["id"], r)   # the first complete record of each scene
        if r.get("ev") == "digest":
            digests[r["id"]] = r
    passes = {}
    for r in recs:
        if r.get("ev") == "pass":
            passes.setdefault(r["id"], []).append(r)
    rows = []
    for sid in order:
        s, d, h, v = scenes.get(sid), digests.get(sid), hostr.get(sid), rvr.get(sid)
        row = {"id": sid}
        if s:
            p = passes.get(sid, [])
            later = [b["renderMs"] - a_["renderMs"] for a_, b in zip(p, p[1:]) if b["pass"] == a_["pass"] + 1 and a_["pass"] >= 1]
            row.update(w=s["w"], h=s["h"], firstImageMs=s["firstImageMs"], coarseMs=s["coarseMs"], halfMs=s["halfMs"],
                       pass1Ms=s["pass1Ms"], passes=s["passes"], secPerPass=s["secPerPass"],
                       laterPassMedianS=round(statistics.median(later) / 1000, 3) if later else None,
                       samplesPerSec=s["samplesPerSec"], cyclesPerSample=s["cyclesPerSample"], displays=s["displays"],
                       displayMsMean=round(s["displayMs"] / s["displays"], 1) if s["displays"] else None,
                       internalPeakUse=s["internalPeakUse"], psramPeakUse=s["psramPeakUse"], skyRebuilt=s["skyRebuilt"])
        if d:
            row.update(digestPasses=d["passes"], deviceFrame0=d["frame0"], deviceAcc=d["acc"], deviceDisp=d["disp"],
                       digestCyclesPerSample=d["cyclesPerSample"], frame0CyclesPerSample=d["frame0CyclesPerSample"])
            if v:
                row.update(rv32Frame0=v.get("frame0"), rv32Acc=v.get("acc"), rv32Disp=v.get("disp"), rv32InstrPerSample=v.get("perSample"),
                           equalRv32=all(d[k] == v.get(k) for k in ("frame0", "acc", "disp")),
                           cpi=round(d["cyclesPerSample"] / v["perSample"], 3) if v.get("perSample") else None)
            if h:
                row.update(hostFrame0=h.get("frame0"), hostAcc=h.get("acc"), hostDisp=h.get("dispFast"),
                           equalHostFrame0=d["frame0"] == h.get("frame0"), equalHostAcc=d["acc"] == h.get("acc"),
                           equalHostDisp=d["disp"] == h.get("dispFast"), hostMeanLum=h.get("meanLum"), deviceMeanLum=d["meanLum"],
                           meanLumRatio=round(d["meanLum"] / h["meanLum"], 9) if h.get("meanLum") else None)
        rows.append(row)
    summary = {"run": str(run), "scenes": rows, "records": len(recs),
               "errors": [r for r in recs if r.get("ev") == "error"]}
    out.write_text(json.dumps(summary, indent=1) + "\n")
    if md:
        L = ["| Scene | Size | First image (ms) | Coarse / half (ms) | First full pass (s) | Later pass (s) | Samples/s | Cycles/sample | Display (ms) | Peak heap PSRAM / internal (bytes) |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
        for r in rows:
            if "firstImageMs" in r:
                L.append(f"| {r['id']} | {r['w']} | {r['firstImageMs']:.0f} | {r['coarseMs']:.0f} / {r['halfMs']:.0f} | {r['pass1Ms'] / 1000:.2f} | "
                         f"{r['laterPassMedianS'] if r['laterPassMedianS'] is not None else '-'} | {r['samplesPerSec']:,.0f} | {r['cyclesPerSample']:,.0f} | "
                         f"{r['displayMsMean']} | {r['psramPeakUse']:,} / {r['internalPeakUse']:,} |")
        L += ["", "| Scene | Passes | Device frame 0 | acc | display | = RV32 | = x86-64 (frame 0, acc, display) | Mean luminance ratio | Cycles/sample | RV32 instr/sample | CPI |",
              "|---|---:|---|---|---|---|---|---:|---:|---:|---:|"]
        for r in rows:
            if "deviceFrame0" in r:
                L.append(f"| {r['id']} | {r['digestPasses']} | {r['deviceFrame0']} | {r['deviceAcc']} | {r['deviceDisp']} | {'yes' if r.get('equalRv32') else 'no'} | "
                         f"{'/'.join('yes' if r.get(k) else 'no' for k in ('equalHostFrame0', 'equalHostAcc', 'equalHostDisp'))} | {r.get('meanLumRatio')} | "
                         f"{r['digestCyclesPerSample']:,.0f} | {r.get('rv32InstrPerSample')} | {r.get('cpi')} |")
        md.write_text("\n".join(L) + "\n")
    print(json.dumps({"scenes": len(rows), "withTimings": sum("firstImageMs" in r for r in rows), "withDigests": sum("deviceFrame0" in r for r in rows),
                      "equalRv32": sum(bool(r.get("equalRv32")) for r in rows), "errors": len(summary["errors"])}))


if __name__ == "__main__":
    main()
