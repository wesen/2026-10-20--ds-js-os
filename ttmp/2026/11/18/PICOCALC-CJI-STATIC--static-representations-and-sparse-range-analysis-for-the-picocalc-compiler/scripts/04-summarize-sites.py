"""Resolve call instruction addresses to enclosing ELF symbols and rank the counted calls."""
from bisect import bisect_right
from collections import Counter
import json
from pathlib import Path
import sys

out, world = Path(sys.argv[1]), sys.argv[2]
symbols = sorted((int(a, 16), int(s, 16), name)
                 for line in (out / 'symbols').read_text().splitlines()
                 if len(parts := line.split()) == 4
                 for a, s, kind, name in [parts] if kind in ('t', 'T'))
starts = [row[0] for row in symbols]
counts = [Counter() for _ in range(3)]
for line in (out / f'{world}.log').read_text().splitlines():
    if line.startswith('SITE '):
        _, address, op, calls = line.split()
        pc = int(address, 16)
        start, size, name = symbols[bisect_right(starts, pc)-1]
        if not start <= pc < start+size:
            raise ValueError(f'unresolved call at {pc:x}')
        counts[int(op)][name] += int(calls)
print(json.dumps({op: dict(total=sum(c.values()), callers=dict(c.most_common()))
                  for op, c in zip(('index', 'get', 'eq'), counts)}, indent=2))
