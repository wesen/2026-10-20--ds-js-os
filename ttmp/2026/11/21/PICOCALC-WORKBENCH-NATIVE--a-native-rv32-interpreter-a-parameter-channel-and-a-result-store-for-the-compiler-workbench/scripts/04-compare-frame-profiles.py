"""Compare two frame-profile results field by field, ignoring the timing fields.
usage: python3 04-compare-frame-profiles.py NATIVE.json REFERENCE.json
Each file is a trace-repl eval result {"ok": true, "value": {"arms": {...}}}."""
import json
import sys

native, reference = (json.load(open(p)) for p in sys.argv[1:3])
for doc, path in ((native, sys.argv[1]), (reference, sys.argv[2])):
    if not doc.get("ok"):
        sys.exit(f"{path}: the cell failed: {doc.get('error')}")
a, b = native["value"]["arms"], reference["value"]["arms"]
same = True
for name in a:
    x, y = dict(a[name]), dict(b[name])
    timing = {k: (x.pop(k), y.pop(k)) for k in ("compileMs", "frameMs")}
    verdict = "identical" if x == y else "DIFFERENT"
    same &= x == y
    print(f"{name}: {verdict}; steps {x['steps']}; frame ms native {timing['frameMs'][0]}, reference {timing['frameMs'][1]}")
sys.exit(0 if same else 1)
