"""Extract the five complete Snake blocks, the physical trace and shared host pixel witness."""
import collections
import hashlib
import json
import statistics
import sys
from pathlib import Path

bench,local,target=map(Path,sys.argv[1:])
read=lambda name:json.loads(name.read_text())
r=read(bench/'physical.json')
rows=[x for x in r['runs'] if x['name']=='snake']
assert len(rows)==15
summary={}
for arm,expected in [('J',15226),('SJ',2382),('T',628)]:
    arm_rows=[x for x in rows if x['arm']==arm]
    assert sorted(x['block'] for x in arm_rows)==list(range(5))
    data=[x['data'] for x in arm_rows]
    assert all(x['count']==24 and x['checksum']==926 and x['bytes']==expected for x in data)
    summary[arm]={k:statistics.median(x[k]/x['count'] for x in data) for k in ('producerUs','receiverUs')}
    summary[arm]['bothUs']=statistics.median((x['producerUs']+x['receiverUs'])/x['count'] for x in data)
    summary[arm]['bytesPerBlock']=expected
stages=collections.defaultdict(list)
trace=read(bench/'trace-snake.json')
for line in trace:
    if line.startswith('LAB TRACE '):
        _,_,start,duration,units,*name=line.split()
        stages[' '.join(name)].append((int(duration),int(units)))
agg={}
for k,units in [('snake render+publish','envelope bytes'),('snake every 110 ms','none'),('compositor draw','none'),
                ('graphics commit','rectangles'),('spi pixel-send','bytes')]:
    a=stages[k]
    agg[k]=dict(n=len(a),medianUs=statistics.median(x[0] for x in a),
                rangeUs=[min(x[0] for x in a),max(x[0] for x in a)],units=units,
                quantityRange=[min(x[1] for x in a),max(x[1] for x in a)])
px=local/'native-pixels/00000.rgb565'
assert px.read_bytes()==(local/'native-template-pixels/00000.rgb565').read_bytes()
witness=read(local/'live-witness.json')
witness['hostRgb565Sha256']=hashlib.sha256(px.read_bytes()).hexdigest()
output=dict(playableFirmware=r['firmwareSha256'],instrumentedFirmware=r['experimentSha256'],
    stagedCapsuleSha256=hashlib.sha256((target.parent/'device-capsule.js').read_bytes()).hexdigest(),blocks=rows,
    microsecondsPerSnapshot=summary,nativeTrace=trace,nativeStageSummary=agg,witness=witness)
target.write_text(json.dumps(output,indent=2)+'\n')
