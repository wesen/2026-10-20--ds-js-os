"""Median compile time in the REPL's goja interpreter, base versus candidate backend, interleaved.

usage: python3 03-compile-cost.py PORT SESSION   (session from 01-open-compiler-session.py --baseline REV)
goja is a bytecode interpreter like QuickJS, so it exposes allocation-heavy compiler passes that
V8 hides. It is a proxy for the P4's cold compile, not a measurement of it.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from repl_client import Session
s = Session(int(sys.argv[1]), sys.argv[2])
s.eval(r'''globalThis.med = xs => { const v = xs.slice().sort((a,b)=>a-b); return (v[(v.length-1)>>1] + v[v.length>>1]) / 2; };
globalThis.Q = {inlineGuardedReturns: true, operandLocations: {forward: true, capacity: true, homes: true}};
globalThis.once = (c, src, imp, o) => { const t = performance.now(); c.compile(src, imp, 96 * 1024, o); return performance.now() - t; };
globalThis.costSamples = {}; undefined''')
arms = [("baseStock", "typedRv32Base", "undefined"), ("baseQualified", "typedRv32Base", "Q"),
        ("candidateStock", "typedRv32", "undefined"), ("candidateQualified", "typedRv32", "Q")]
for name, src, imp, n in [("ray", "raySource", "[]", 9), ("chess", "worlds.chess", "typedWorld.imports", 5),
                          ("editor", "worlds.editor", "typedWorld.imports", 3)]:
    for _ in range(n):
        for arm, c, o in arms:   # one cell per compile: a cell has a 15 s deadline
            s.eval(f"(costSamples['{name}.{arm}'] ??= []).push(once({c}, {src}, {imp}, {o})); undefined")
print(json.dumps(s.eval("Object.fromEntries(Object.entries(costSamples).map(([k, v]) => [k, +med(v).toFixed(1)]))"), indent=1))
