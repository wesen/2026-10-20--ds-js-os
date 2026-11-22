"""Median compile time and image size in the REPL's goja interpreter for named option arms.

usage: python3 13-compile-cost-arms.py PORT MODES_JSON OUT [NAME=INDEX ...]
  MODES_JSON  a board modes file (a JSON list of option objects); each NAME=INDEX picks one
              mode as an arm. Without NAME=INDEX every mode is an arm named m0, m1, ...
Arms are interleaved per program so drift in the host affects every arm alike. goja is a
bytecode interpreter like QuickJS, so it is a proxy for the P4's cold compile.
"""
import json, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from repl_client import Session
port, modes_path, out = int(sys.argv[1]), sys.argv[2], sys.argv[3]
modes = json.load(open(modes_path))
picks = [a.split("=") for a in sys.argv[4:]] or [[f"m{i}", str(i)] for i in range(len(modes))]
arms = {name: modes[int(i)] for name, i in picks}
session = subprocess.run([sys.executable, os.path.join(here, "01-open-compiler-session.py"), str(port)],
                         check=True, capture_output=True, text=True).stdout.strip()
s = Session(port, session)
s.eval("globalThis.med = xs => { const v = xs.slice().sort((a,b)=>a-b); return (v[(v.length-1)>>1] + v[v.length>>1]) / 2; };"
       "globalThis.arms = " + json.dumps(arms) + ";"
       "globalThis.once = (src, imp, o) => { const t = performance.now(); const p = typedRv32.compile(src, imp, 96 * 1024, o);"
       " return [performance.now() - t, p.image.length]; };"
       "globalThis.cc = {}; globalThis.sz = {}; undefined")
for name, src, imp, n in [("ray", "raySource", "[]", 5), ("chess", "worlds.chess", "typedWorld.imports", 3),
                          ("editor", "worlds.editor", "typedWorld.imports", 3), ("files", "worlds.files", "typedWorld.imports", 3),
                          ("agenda", "worlds.agenda", "typedWorld.imports", 3)]:
    for _ in range(n):
        for arm in arms:   # one cell per compile: a cell has a 15 s deadline
            s.eval(f"{{ const [t, b] = once({src}, {imp}, arms[{json.dumps(arm)}]); (cc['{name}.{arm}'] ??= []).push(t); sz['{name}.{arm}'] = b; }} undefined")
r = s.eval("({ms: Object.fromEntries(Object.entries(cc).map(([k, v]) => [k, +med(v).toFixed(1)])), bytes: sz})")
r["arms"] = arms
json.dump(r, open(out, "w"), indent=1)
print(json.dumps({k: r[k] for k in ("ms", "bytes")}, indent=1))
