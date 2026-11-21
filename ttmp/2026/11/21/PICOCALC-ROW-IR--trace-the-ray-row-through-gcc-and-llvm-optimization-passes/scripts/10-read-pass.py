"""Find snapshots by case-insensitive header substring. Select one by its listed index."""
import argparse
import gzip
import json
import sys
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('case',choices=['checked','unchecked','firmware'])
p.add_argument('phase',choices=['middle','backend'])
p.add_argument('query')
p.add_argument('--entry',type=int,help='write the snapshot for this matching zero-based index')
args=p.parse_args()
root=Path(__file__).resolve().parents[1]/'various/llvm-pipeline'
stem=f'{args.case}-{args.phase}'
entries=json.loads(gzip.decompress((root/(stem+'.index.json.gz')).read_bytes()))
matches=[i for i,r in enumerate(entries) if args.query.lower() in r['header'].lower()]
if args.entry is None:
    for i in matches: print(i,entries[i]['header'])
else:
    if args.entry not in matches: p.error('entry does not match the query')
    i=args.entry
    with gzip.open(root/(stem+'.log.gz'),'rb') as f:
        start=entries[i]['offset']; f.seek(start)
        sys.stdout.buffer.write(f.read(entries[i+1]['offset']-start) if i+1<len(entries) else f.read())
