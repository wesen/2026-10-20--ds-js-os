"""Compose independent v1 capture files without changing their image keys."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('output',type=Path)
p.add_argument('files',type=Path,nargs='+')
args=p.parse_args()
out={'format':'p4-simd-evidence-v1','images':[],'traces':[],'decisions':[],'packetSets':[]}
keys={'images':'sha256','traces':'id','decisions':'id','packetSets':'workload'}
for path in args.files:
    capture=json.loads(path.read_text())
    if capture['format']!=out['format']: raise ValueError(f'format mismatch: {path}')
    for group,key in keys.items():
        existing={row[key]:row for row in out[group]}
        for row in capture[group]:
            item=row[key]
            if item in existing:
                if existing[item]!=row:raise ValueError(f'conflicting {group} {item}: {path}')
            else:
                out[group].append(row)
                existing[item]=row
args.output.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
