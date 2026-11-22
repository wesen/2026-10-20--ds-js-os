#!/usr/bin/env python3
"""packdiff.py: compare packed Float32 arrays written by `driver.mjs dump` under two engines.

usage: python3 -I packdiff.py A.json B.json [more pairs...]
For each array (U, O, LI, BV, SDs, SDd) at t=0 and t=2.5: elements that differ, the largest absolute
difference, and the largest difference in float32 ulps. Prints one JSON line per pair."""
import json
import struct
import sys


def ulps(a, b):
    """distance in float32 units in the last place (values are already float32, stored as doubles)."""
    def key(x):
        i = struct.unpack('<i', struct.pack('<f', x))[0]
        return i if i >= 0 else -(i & 0x7fffffff)
    return abs(key(a) - key(b))


def compare(pa, pb):
    A, B = json.load(open(pa)), json.load(open(pb))
    out = {'a': pa.rsplit('/', 1)[-1], 'b': pb.rsplit('/', 1)[-1], 'id': A['id'], 'arrays': {}}
    for t in ('t0', 't25'):
        for k in A[t]:
            x, y = A[t][k], B[t].get(k)
            if y is None or len(x) != len(y):
                out['arrays'][t + '.' + k] = {'lengthMismatch': [len(x), None if y is None else len(y)]}
                continue
            nd, maxabs, maxulp, maxrel, worst = 0, 0.0, 0, 0.0, None
            for i, (u, v) in enumerate(zip(x, y)):
                if u != v:
                    nd += 1
                    d = abs(u - v)
                    ul = ulps(u, v)
                    rel = d / max(abs(u), abs(v)) if max(abs(u), abs(v)) else 0.0
                    if ul > maxulp:
                        maxulp, worst = ul, [i, u, v]
                    maxabs, maxrel = max(maxabs, d), max(maxrel, rel)
            if nd:
                out['arrays'][t + '.' + k] = {'n': len(x), 'differ': nd, 'maxAbs': maxabs, 'maxRel': maxrel, 'maxUlp': maxulp, 'worst': worst}
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) < 2 or len(args) % 2:
        sys.exit(__doc__)
    for i in range(0, len(args), 2):
        print(json.dumps(compare(args[i], args[i + 1])))
