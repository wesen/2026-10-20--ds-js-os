"""Independently compare the archived measured serial records with the parsed device receipt."""
from pathlib import Path
import json,sys
raw,physical,gold=map(Path,sys.argv[1:]);lines=raw.read_text().splitlines()
hw=json.loads(physical.read_text());checks=json.loads(gold.read_text())
assert 'INC_DONE ok' in lines
def records(k):return [line[len(k):] for line in lines if line.startswith(k)]
assert [json.loads(line) for line in records('INC_ROW ')]==hw['rows']
seen=set()
for r in hw['rows']:
    key=(r['app'],r['key'],r['arm'],r['block']); assert key not in seen and r['us']>0 and r['crc']==checks[r['app']][r['key']]
    seen.add(key)
assert len(seen)==90
fresh=[]
for line in records('INC_COLD '):
    app,arm,us,peak,crc=line.split();row=dict(app=app,arm=arm,us=int(us),peakBytes=int(peak),crc=int(crc))
    assert row['crc']==checks[app]['base'];fresh.append(row)
assert len(fresh)==4 and fresh==hw['cold']
assert hw['memory']=={app:int(n) for app,n in (line.split() for line in records('INC_MEM '))}
assert hw['restoredReadback'] and hw['qualified'] and hw['restoredPainter']['installed'] and not hw['restoredPainter']['rejects']
print('90 unique warm app/edit/arm/block observations, 4 fresh observations, 2 warm heap peaks, release readback and healthy painter verified')
