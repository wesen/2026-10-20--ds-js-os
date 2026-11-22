#!/usr/bin/env python3
"""14-unsequenced-rnd.py: statements whose evaluation order matters, in WGSL that is translated to C++.

usage: python3 -I 14-unsequenced-rnd.py FILE.wgsl...

WGSL evaluates the operands of an expression, including function arguments, left to right. C++ leaves the
order of function arguments and of most operands unspecified, and GCC chooses it per target. A statement
that calls two functions which draw random numbers (rnd, rnd2, and every function that calls one of them,
transitively) therefore draws them in an order that can differ between x86-64 and RV32. This lists every
such statement."""
import re
import sys

for path in sys.argv[1:]:
    src = open(path).read()
    fns = {}
    for m in re.finditer(r"\bfn\s+(\w+)\s*\(", src):
        i = src.index("{", m.end())
        d, j = 0, i
        while True:
            if src[j] == "{":
                d += 1
            elif src[j] == "}":
                d -= 1
                if d == 0:
                    break
            j += 1
        fns[m.group(1)] = src[i:j + 1]
    impure, changed = {"rnd", "rnd2"}, True
    while changed:
        changed = False
        for n, b in fns.items():
            if n not in impure and any(re.search(r"\b%s\s*\(" % f, b) for f in impure):
                impure.add(n)
                changed = True
    print(path.split("/")[-1], "draws random numbers:", " ".join(sorted(impure)))
    for n, b in fns.items():
        for st in re.split(r";|\{|\}", b):
            calls = [f for f in re.findall(r"\b(\w+)\s*\(", st) if f in impure]
            if len(calls) > 1:
                print(f"  in {n}: {' '.join(st.split())[:160]}  -> {calls}")
