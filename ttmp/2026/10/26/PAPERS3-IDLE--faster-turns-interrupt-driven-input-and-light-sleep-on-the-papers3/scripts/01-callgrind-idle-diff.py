#!/usr/bin/env python3
# Self-cost difference between two callgrind profiles, e.g. the host booted and idle for 1 s against 11 s:
#   valgrind --tool=callgrind --callgrind-out-file=cg-1.out build-papers3/papers3-host -j js-papers3 idle1.txt   (idle1.txt: "wait 1000")
#   python3 01-callgrind-idle-diff.py cg-1.out cg-11.out
import re, subprocess, sys
def load(f):
    out = subprocess.run(["callgrind_annotate", "--inclusive=no", "--tree=none", "--threshold=100", "--auto=no", f], capture_output=True, text=True).stdout.splitlines()
    i = next(n for n, l in enumerate(out) if l.rstrip().endswith("file:function")) + 2
    d = {}
    for line in out[i:]:
        m = re.match(r"\s*([\d,]+)\s+\([^)]*\)\s+(\S[^\[]*)", line)
        if not m: break
        k = m.group(2).strip().split("/")[-1]
        d[k] = d.get(k, 0) + int(m.group(1).replace(",", ""))
    return d
a, b = load(sys.argv[1]), load(sys.argv[2])
diff = sorted(((b.get(k, 0) - a.get(k, 0), k) for k in set(a) | set(b)), reverse=True)
tot = sum(x for x, _ in diff)
print(f"total difference {tot/1e6:.1f} M Ir")
for x, k in diff[:30]:
    print(f"{x/1e6:8.2f} M {100*x/tot:5.1f}%  {k}")
