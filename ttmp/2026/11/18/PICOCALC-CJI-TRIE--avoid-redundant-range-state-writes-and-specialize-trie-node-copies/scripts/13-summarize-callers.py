"""Compare source-attributed dynamic calls across the control and three generated frontends."""
import argparse
import json
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('build',type=Path)
args=parser.parse_args()
control=next(Path('ttmp/2026/11/18').glob('*CJI-STATIC*/various'))
out={}
for world in ('agenda','files'):
    rows={}
    for variant in ('guard','reuse','typed','both'):
        source=(control/f'{world}-callers.json' if variant=='guard'
                else args.build/variant/'callers'/f'{world}.json')
        counters=json.loads(source.read_text())
        rows[variant]={op:dict(total=stat['total'],slice=sum(n for name,n in stat['callers'].items()
                           if name.startswith('slice.'))) for op,stat in counters.items()}
    out[world]=rows
print(json.dumps(out,indent=2))
