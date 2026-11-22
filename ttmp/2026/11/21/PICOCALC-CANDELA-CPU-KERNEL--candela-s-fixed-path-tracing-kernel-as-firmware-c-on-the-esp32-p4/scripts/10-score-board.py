#!/usr/bin/env python3
"""10-score-board.py: turn a timing run's bench.log into cycles per sample, CPI and substitution tables.

usage: python3 -I 10-score-board.py BENCH.log COUNTS.jsonl OUT.json [--md OUT.md]

COUNTS.jsonl is 04-build.py's interpreter output for the same libraries. For every arm and scene the score
holds the median cycles per sample over the warm frames (the first frame of each arm and scene is reported
separately as cold), the interpreter's instructions per sample, their ratio (cycles per instruction), and
whether the device's frame digest equals the interpreter's (the same instructions on the same inputs).
Substitution tables: the ladder (each arm adds one switch to the previous one) and leave-one-out (cpu
without one switch). Also microbenchmark latencies, the post pass, buffer placement and cache counters."""
import json
import statistics
import sys
from pathlib import Path

log, counts_path, out_path = sys.argv[1:4]
md_path = sys.argv[sys.argv.index("--md") + 1] if "--md" in sys.argv else None
counts = {(r["arm"], r["scene"]): r for r in map(json.loads, open(counts_path))}
CC = ["l1i0_hit", "l1i0_miss", "l1i1_hit", "l1i1_miss", "l1d0_hit", "l1d0_miss", "l1d1_hit", "l1d1_miss",
      "l2i0_hit", "l2i0_miss", "l2i1_hit", "l2i1_miss", "l2d0_hit", "l2d0_miss", "l2d1_hit", "l2d1_miss"]
frames, micro, post, info, scenes, armsinfo, minstret = [], {}, [], {}, {}, {}, None
for raw in open(log, "rb"):
    line = raw.decode(errors="replace").strip()
    p = line.split()
    if not p:
        continue
    if p[0] == "CKMICRO":
        micro[p[1]] = {"ops": int(p[2]), "cycles": int(p[3])}
    elif p[0] == "CKFRAME":
        f = dict(stage=p[1], arm=p[2], scene=p[3], block=int(p[4]), cold=int(p[5]), bound=int(p[6]), bindCycles=int(p[7]),
                 cycles=int(p[8]), digest=p[9], meanLum=float(p[10]))
        f.update({k: int(v) for k, v in zip(CC, p[11:27])})
        frames.append(f)
    elif p[0] == "CKPOST":
        post.append(dict(arm=p[1], block=int(p[2]), pixels=int(p[3]), display=int(p[4]), denoise=int(p[5]), dDigest=p[6], nDigest=p[7]))
    elif p[0] == "CKSCENE":
        scenes[p[1]] = {"w": int(p[2]), "h": int(p[3]), "bytes": int(p[4])}
    elif p[0] == "CKARM":
        armsinfo[p[1]] = {"render_span": p[3], "skyBytes": int(p[5]), "post": int(p[7])}
    elif p[0] == "CKINFO":
        info[" ".join(p[1:3])] = p[3:]
    elif p[0] == "CKMINSTRET":
        minstret = {"retired": int(p[1]), "cycles": int(p[2])}

arms = []
for f in frames:
    if f["stage"] == "time" and f["arm"] not in arms:
        arms.append(f["arm"])
scene_ids = list(scenes)
cells = {}
for a in arms:
    for s in scene_ids:
        fs = [f for f in frames if f["stage"] == "time" and f["arm"] == a and f["scene"] == s]
        if not fs:
            continue
        n = scenes[s]["w"] * scenes[s]["h"]
        warm = [f["cycles"] / n for f in fs if not f["cold"]]
        cold = [f["cycles"] / n for f in fs if f["cold"]]
        c = counts.get((a, s), {})
        coldOnly = not warm   # a partial log: only the first (cold) frames
        if coldOnly:
            warm = cold
        med = statistics.median(warm)
        digests = sorted({f["digest"] for f in fs})
        cell = {"coldOnly": coldOnly, "cyclesPerSample": med, "spread": (max(warm) - min(warm)) / med if warm else None, "cold": cold[0] if cold else None,
                "samplesPerSecond": 360e6 / med if med else None, "instructionsPerSample": c.get("perSample"),
                "cpi": med / c["perSample"] if med and c.get("perSample") else None, "deviceDigests": digests,
                "interpreterDigest": c.get("digest"), "digestMatch": digests == [c.get("digest")],
                "bindCycles": statistics.median([f["bindCycles"] for f in fs]), "bound": sorted({f["bound"] for f in fs}),
                "meanLum": fs[0]["meanLum"]}
        acc = {k: statistics.median([f[k] for f in fs if coldOnly or not f["cold"]]) for k in CC}
        cell["cache"] = {k: v / n for k, v in acc.items()}
        cells[f"{a}|{s}"] = cell

ladder = ["wgsl", "lazy", "noinit", "floor", "trig", "exp", "hash", "cpu"]
switch_of = {"lazy": "lazy select", "noinit": "no zero-init", "floor": "conversion floor", "trig": "polynomial sin/cos",
             "exp": "polynomial exp", "hash": "integer hash", "cpu": "sky table (+ pow32 in post)"}


def cps(a, s):
    c = cells.get(f"{a}|{s}")
    return c["cyclesPerSample"] if c else None


subst = {}
for s in scene_ids:
    rows = []
    for prev, cur in zip(ladder, ladder[1:]):
        if cps(prev, s) and cps(cur, s):
            rows.append({"switch": switch_of[cur], "ladderStep": cur, "ladderDelta": cps(cur, s) - cps(prev, s),
                         "withoutIt": cps("cpu-" + cur, s) if cur != "cpu" else cps("hash", s)})
    subst[s] = {"wgsl": cps("wgsl", s), "cpu": cps("cpu", s), "steps": rows}

postr = {}
for a in {p["arm"] for p in post}:
    ps = [p for p in post if p["arm"] == a]
    postr[a] = {"displayCyclesPerPixel": statistics.median([p["display"] / p["pixels"] for p in ps]),
                "denoiseCyclesPerPixel": statistics.median([p["denoise"] / p["pixels"] for p in ps]), "digests": sorted({p["dDigest"] + "/" + p["nDigest"] for p in ps})}
place = {}
for st in ("internal", "psram"):
    for s in scene_ids:
        fs = [f for f in frames if f["stage"] == st and f["scene"] == s]
        if fs:
            n = scenes[s]["w"] * scenes[s]["h"]
            place[f"{st}|{s}"] = {"cyclesPerSample": statistics.median([f["cycles"] / n for f in fs]), "l1dMissPerSample": statistics.median([f["l1d0_miss"] / n for f in fs])}
micror = {k: {"cyclesPerOp": v["cycles"] / v["ops"] if v["ops"] else v["cycles"], **v} for k, v in micro.items()}
res = {"cells": cells, "substitutions": subst, "post": postr, "placement": place, "micro": micror, "minstret": minstret, "arms": armsinfo, "scenes": scenes, "info": info}
Path(out_path).write_text(json.dumps(res, indent=1) + "\n")

L = []
L.append("## Cycles per sample (median of warm frames), instructions per sample, CPI, digest check\n")
L.append("| arm | " + " | ".join(scene_ids) + " |")
L.append("|---|" + "---|" * len(scene_ids))
for a in arms:
    row = []
    for s in scene_ids:
        c = cells.get(f"{a}|{s}")
        row.append("-" if not c else f"{c['cyclesPerSample']:,.0f} / {c['instructionsPerSample']:,.0f} = {c['cpi']:.2f}{'' if c['digestMatch'] else ' DIGEST'}")
    L.append(f"| {a} | " + " | ".join(row) + " |")
L.append("\n## Substitutions: cycles per sample\n")
for s in scene_ids:
    d = subst[s]
    if not d["steps"] or not d["wgsl"] or not d["cpu"]:
        continue
    L.append(f"### {s}: WGSL semantics {d['wgsl']:,.0f}, all substitutions {d['cpu']:,.0f} ({d['wgsl'] / d['cpu']:.2f}x)\n")
    L.append("| switch | ladder: cycles saved when added | cpu without it | cost of leaving it out |")
    L.append("|---|---:|---:|---:|")
    for r in d["steps"]:
        w = r["withoutIt"]
        L.append(f"| {r['switch']} | {-r['ladderDelta']:,.0f} | {w:,.0f} | {w - d['cpu']:+,.0f} |" if w else f"| {r['switch']} | {-r['ladderDelta']:,.0f} | - | - |")
    L.append("")
L.append("## Microbenchmarks (cycles per instruction)\n")
for k, v in micror.items():
    L.append(f"- {k}: {v['cyclesPerOp']:.2f} ({v['cycles']} cycles / {v['ops']})")
L.append("\n## Post pass (cycles per pixel)\n")
for a, v in sorted(postr.items()):
    L.append(f"- {a}: display {v['displayCyclesPerPixel']:,.0f}, one a-trous iteration {v['denoiseCyclesPerPixel']:,.0f}")
L.append("\n## Placement\n")
for k, v in place.items():
    L.append(f"- {k}: {v['cyclesPerSample']:,.0f} cycles per sample, L1D misses per sample {v['l1dMissPerSample']:.1f}")
if minstret:
    L.append(f"\nminstret: {minstret}")
text = "\n".join(L) + "\n"
if md_path:
    Path(md_path).write_text(text)
print(text)
