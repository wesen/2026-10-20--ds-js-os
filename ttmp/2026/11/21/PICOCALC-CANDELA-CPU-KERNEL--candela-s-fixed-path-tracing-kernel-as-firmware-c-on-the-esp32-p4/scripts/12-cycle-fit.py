#!/usr/bin/env python3
"""12-cycle-fit.py: what does each instruction class cost on the P4? Two cycle models against measurement.

usage: python3 -I 12-cycle-fit.py SCORE.json COUNTS.jsonl [--md OUT.md]

SCORE.json is 10-score-board.py's output (measured cycles per sample per arm and scene), COUNTS.jsonl the
interpreter's instructions per sample by class for the same code. Prints three things:
  1. the parent ticket's assumed model (PICOCALC-CANDELA-P4 scripts/14-cycle-model.py): 1.13 cycles per
     integer/memory/branch instruction, 10-30 per fdiv/fsqrt, 1-2 per other FP instruction; its range
     against the measured cycles;
  2. a model from this ticket's microbenchmarks, applied as if every instruction waited for its result
     (latency-bound) and as if none did (issue-bound), which brackets the measurement;
  3. a non-negative least-squares fit of cycles per sample to instructions per sample by class over all
     arms and scenes: the effective cost of each class in this code (correlated classes share credit)."""
import json
import sys

import numpy as np
from scipy.optimize import nnls

score = json.load(open(sys.argv[1]))
counts = {(r["arm"], r["scene"]): r for r in map(json.loads, open(sys.argv[2]))}
md = sys.argv[sys.argv.index("--md") + 1] if "--md" in sys.argv else None
GROUPS = {"int (alu, branch, jump)": ["alu", "branch", "jump"], "mul": ["mul"], "div": ["div"], "load": ["load"], "store": ["store"],
          "fp load": ["fload"], "fp store": ["fstore"], "fadd/fmul/fmin/fsgnj/fcmp": ["fadd", "fmul", "fminmax_sgnj", "fcmp_class"],
          "fma": ["fma"], "fcvt/fmv": ["fcvt_fmv"], "fdiv": ["fdiv"], "fsqrt": ["fsqrt"]}
rows = []
for key, c in score["cells"].items():
    a, s = key.split("|")
    k = counts.get((a, s))
    if not k or not c.get("cyclesPerSample"):
        continue
    cl = k["classesPerSample"]
    rows.append((a, s, c["cyclesPerSample"], k["perSample"], [sum(cl.get(x, 0) for x in g) for g in GROUPS.values()], cl))
L = []
# 1. the parent's model
L.append("## The parent's assumed model against measurement\n")
L.append("| arm | scene | instructions | model low-high | measured | measured / model high |")
L.append("|---|---|---:|---:|---:|---:|")
FP = ["fadd", "fmul", "fma", "fminmax_sgnj", "fcvt_fmv", "fcmp_class"]
for a, s, cyc, n, g, cl in rows:
    if a not in ("proto", "lazy", "cpu", "wgsl"):
        continue
    dv = cl.get("fdiv", 0) + cl.get("fsqrt", 0)
    fa = sum(cl.get(x, 0) for x in FP)
    rest = n - dv - fa
    lo, hi = rest * 1.13 + dv * 10 + fa, rest * 1.13 + dv * 30 + fa * 2
    L.append(f"| {a} | {s} | {n:,.0f} | {lo:,.0f}-{hi:,.0f} | {cyc:,.0f} | {cyc / hi:.2f} |")
# 2. microbenchmark bracket
mic = score.get("micro", {})
lat = {"int (alu, branch, jump)": 1, "mul": mic.get("mul", {}).get("cyclesPerOp", 2), "div": 11, "load": mic.get("lw-chain", {}).get("cyclesPerOp", 2),
       "store": 1, "fp load": 2, "fp store": 1, "fadd/fmul/fmin/fsgnj/fcmp": mic.get("fadd.s", {}).get("cyclesPerOp", 4), "fma": mic.get("fmadd.s", {}).get("cyclesPerOp", 5),
       "fcvt/fmv": 3, "fdiv": mic.get("fdiv.s", {}).get("cyclesPerOp", 19), "fsqrt": 19}
issue = {k: 1 for k in GROUPS} | {"fdiv": lat["fdiv"], "fsqrt": lat["fsqrt"], "div": 11}
L.append("\n## Bracket from the microbenchmarks (cycles per sample)\n")
L.append("| arm | scene | issue-bound | latency-bound | measured |")
L.append("|---|---|---:|---:|---:|")
for a, s, cyc, n, g, cl in rows:
    if a in ("cpu", "lazy", "wgsl"):
        lo = sum(x * issue[k] for x, k in zip(g, GROUPS))
        hi = sum(x * lat[k] for x, k in zip(g, GROUPS))
        L.append(f"| {a} | {s} | {lo:,.0f} | {hi:,.0f} | {cyc:,.0f} |")
# 3. least squares, over coarse groups the arms actually vary independently, plus measured cache misses
FIT = {"integer and memory (alu, mul, div, branch, jump, load, store, flw, fsw)": ["alu", "mul", "div", "branch", "jump", "load", "store", "fload", "fstore"],
       "FP add, mul, min/max, sign, compare, convert": ["fadd", "fmul", "fminmax_sgnj", "fcmp_class", "fcvt_fmv"], "FP fused multiply-add": ["fma"],
       "fdiv.s and fsqrt.s": ["fdiv", "fsqrt"]}
MISS = {"L1 instruction-cache miss": "l1i0_miss", "L1 data-cache miss": "l1d0_miss"}
X, b, names = [], [], list(FIT) + list(MISS)
for a, s, cyc, n, g, cl in rows:
    cache = score["cells"][f"{a}|{s}"].get("cache", {})
    X.append([sum(cl.get(k, 0) for k in ks) for ks in FIT.values()] + [cache.get(v, 0) for v in MISS.values()])
    b.append(cyc)
X, b = np.array(X), np.array(b)
for label, cols in (("instruction classes only", list(range(len(FIT)))), ("instruction classes and cache misses", list(range(len(names))))):
    x, _ = nnls(X[:, cols], b)
    err = np.abs(X[:, cols] @ x - b) / b
    L.append(f"\n## Effective cycles per event: {label} (non-negative least squares over {len(rows)} arm x scene cells)\n")
    L.append("| event | cycles each | events per B-01 cpu sample | share of B-01 cpu cycles |")
    L.append("|---|---:|---:|---:|")
    ref = next(i for i, r in enumerate(rows) if r[0] == "cpu" and r[1] == "B-01")
    for j, v in zip(cols, x):
        L.append(f"| {names[j]} | {v:.2f} | {X[ref, j]:,.0f} | {X[ref, j] * v / b[ref]:.0%} |")
    L.append(f"\nFit error: median {np.median(err):.1%}, max {err.max():.1%} of measured cycles.")
text = "\n".join(L) + "\n"
if md:
    open(md, "w").write(text)
print(text)
