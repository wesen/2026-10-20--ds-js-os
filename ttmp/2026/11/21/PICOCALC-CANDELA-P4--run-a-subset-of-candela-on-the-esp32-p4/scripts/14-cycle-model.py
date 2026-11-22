#!/usr/bin/env python3
"""14-cycle-model.py: turn counted RV32 instructions per sample into a range of ESP32-P4 cycles and samples/s.

usage: python3 -I 14-cycle-model.py KERNEL-COUNTS.jsonl [MHZ]

Assumptions (none measured on the device for this code):
  integer, load/store, branch and FP load/store instructions: 1.13 cycles each (GCC -O3 integer ray tracer
      on the P4: 2,450,039 instructions in 7.72 ms at 360 MHz; RAY-PARITY diary Step 13)
  fdiv.s and fsqrt.s: 10 (low) to 30 (high) cycles each
  other FP arithmetic (add, mul, fma, min/max/sign, convert/move, compare/class): 1 (low) to 2 (high) cycles
"""
import json
import sys

mhz = float(sys.argv[2]) if len(sys.argv) > 2 else 360.0
FP = ["fadd", "fmul", "fma", "fminmax_sgnj", "fcvt_fmv", "fcmp_class"]
print(f"{'preset':7} {'opt':4} {'instr':>8} {'div+sqrt':>8} {'fp-arith':>8} {'cycles lo-hi':>15} {'samples/s':>15} {'160x160 pass s':>15}")
for line in open(sys.argv[1]):
    d = json.loads(line)
    if "classesPerSample" not in d:
        continue
    c, n = d["classesPerSample"], d["perSample"]
    dv = c.get("fdiv", 0) + c.get("fsqrt", 0)
    fa = sum(c.get(k, 0) for k in FP)
    rest = n - dv - fa
    lo, hi = rest * 1.13 + dv * 10 + fa * 1, rest * 1.13 + dv * 30 + fa * 2
    s_lo, s_hi = mhz * 1e6 / hi, mhz * 1e6 / lo
    print(f"{d['preset']:7} {d['opt']:4} {n:8.0f} {dv:8.1f} {fa:8.0f} {lo:7.0f}-{hi:<7.0f} {s_lo:7.0f}-{s_hi:<7.0f} {25600 / s_hi:6.2f}-{25600 / s_lo:<6.2f}")
