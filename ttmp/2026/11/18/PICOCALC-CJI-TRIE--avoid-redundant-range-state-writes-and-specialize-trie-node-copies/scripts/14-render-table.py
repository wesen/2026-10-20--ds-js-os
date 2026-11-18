"""Produce the project report's numerical comparison from archived cross-target receipts."""
from argparse import ArgumentParser
import json
from pathlib import Path

parser=ArgumentParser(description=__doc__)
parser.add_argument('physical',type=Path)
parser.add_argument('instructions',type=Path)
args=parser.parse_args()
board=json.loads(args.physical.read_text())
insns={(w,n):int(value) for line in args.instructions.read_text().splitlines() for w,n,value in [line.split()]}
for mode in ('time','memory'):
    if mode == 'time':
        print('| World | Compiler | Module time (s) | Frontend (s) | GC (s) | x86 instructions (billions) |')
        print('|---|---|---:|---:|---:|---:|')
    else:
        print('| World | Compiler | Collections | Peak live (bytes) | Scratch peak (bytes) |')
        print('|---|---|---:|---:|---:|')
    for world,variants in board.items():
        for name in ('guard','reuse','typed','both'):
            r=variants[name]
            prefix=f'| {world.title()} | {name} | '
            if mode == 'time':
                print(prefix+f"{r['elapsed_s']:.3f} | {r['frontend_s']:.3f} | {r['gc_s']:.3f} | {insns[world,name]/1e9:.3f} |")
            else:
                print(prefix+f"{r['collections']} | {r['live_peak_bytes']:,} | {r['scratch_bytes']:,} |")
    print()
