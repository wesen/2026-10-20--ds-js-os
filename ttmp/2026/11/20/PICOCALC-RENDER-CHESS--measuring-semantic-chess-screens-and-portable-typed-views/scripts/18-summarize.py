"""Verify mobile raw pictures, summarize fresh-process installs and find byte crossover on the recorded opening."""
import hashlib
import json
import statistics
import sys
from pathlib import Path
d=Path(sys.argv[1])
load=lambda name:json.loads((d/name).read_text())
replay,gate,times=load('replay.json'),load('pixel-gate.json'),load('host-timing.json')
pixels={}
for arm in ('M','S'):
    mobile=load(f'{arm}-pixels/receipt.json')
    for x,y in zip(gate['rows'],mobile,strict=True):
        name=y['filename']
        control=(d/'control-pixels'/name).read_bytes()
        assert (d/f'{arm}-pixels'/name).read_bytes()==control
        assert x['id']==y['id'] and x['sha256']==y['pixelSha256']==hashlib.sha256(control).hexdigest()
    pixels[arm]=len(mobile)
cold=[json.loads(s) for s in (d/'cold.ndjson').read_text().splitlines()]
def col(values):return {'n':len(values),'median':statistics.median(values),'min':min(values),'max':max(values)}
summary={'rawRGB565':pixels,'coldMicroseconds':{},'changedOpeningPosts':0,'openingByteCrossover':{},
         'assumptions':'Host byte crossover adds the 8-byte binary install header and payload once; only actual changed posts count.'}
for arm in ('R','M','S'):
    rows=[r for r in cold if r['arm']==arm]
    assert len(rows)==12
    summary['coldMicroseconds'][arm]={key:col([r[key] for r in rows]) for key in ['installUs','instantiateUs','firstUs']}
opening=[r for r in replay['rows'] if r['id'].startswith('opening/') and r['changed']]
summary['changedOpeningPosts']=len(opening)
for arm,install in times['installWire'].items():
    savings=0
    for i,r in enumerate(opening,start=1):
        savings+=r['controlPost']-r['semanticPost']
        if savings>install:
            summary['openingByteCrossover'][arm]={'changedPosts':i,'event':r['id'],'savedBytesBeforeInstall':savings,'installBytes':install}
            break
summary['rowsByScope']={}
for name,rows in [('opening',opening),('all',[r for r in replay['rows'] if r['changed']])]:
    totals={k:sum(r[k] for r in rows) for k in ('controlBody','semanticBody','controlPost','semanticPost')}
    summary['rowsByScope'][name]={**totals,'callsAfterDedup':len(rows),'framedRatio':totals['controlPost']/totals['semanticPost']}
(d/'host-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary['openingByteCrossover']))
