"""Verify and summarize the fixed native reader segment of the common instrumented-board session."""
import hashlib
import json
import pathlib
import statistics
import sys
from collections import Counter

bench,out=map(pathlib.Path,sys.argv[1:])
r=json.loads(bench.read_text())
rows=[x for x in r['runs'] if x['name']=='nativebin']
assert len(rows)==56 and not [x for x in r['failures'] if 'nativebin' in str(x)]
qjs={(x['block'],x['arm']):x['data'] for x in r['runs'] if x['name']=='binary'}
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def per_stage(d,key):return d[key]/d['reps']
def median(xs):return statistics.median(xs)
results={}
for app in ('sysmon','chess','snake','editor'):
    results[app]={}
    for arm in 'GB':
        name=app+'-'+arm
        items=[x for x in rows if x['arm']==name]
        assert Counter(x['block'] for x in items)==Counter(range(7))
        for x in items:
            d=x['data'];j=qjs[x['block'],name]
            assert d['reps']==8 and d['bytes']==j['bytes']
            for k in ('lookupHash','repeatLookupHash','walkHash'):assert (d[k]&0xffffffff)==(j[k]&0xffffffff)
        ds=[x['data'] for x in items]
        stages={k:median(per_stage(x,k) for x in ds) for k in ('admitUs','lookupUs','repeatLookupUs','walkUs','releaseUs')}
        stages['admitWalkReleaseUs']=median((x['admitUs']+x['walkUs']+x['releaseUs'])/x['reps'] for x in ds)
        stages['bytes']=ds[0]['bytes']
        stages['qjsEncodeUs']=median(per_stage(qjs[x['block'],name],'encodeUs') for x in items)
        results[app][arm]=stages
    g,b=results[app]['G'],results[app]['B']
    results[app]['nativeConsumerSavingUs']=g['admitWalkReleaseUs']-b['admitWalkReleaseUs']
    results[app]['qjsExtraProducerUs']=b['qjsEncodeUs']-g['qjsEncodeUs']
d=pathlib.Path(__file__).resolve().parent
out.write_text(json.dumps(dict(firmware=r['experimentSha256'],original=r['firmwareSha256'],
    includeSha256=digest(d/'02-native.inc'),fixturesSha256=digest(d/'binary_native_fixtures.h'),
    cells='7 blocks x 8 repetitions per C arm, medians of per-block means',
    scope='native C receipt/copy/validation, sparse checksum, 32 alternating first/last checksums, full checksum, release; no native encode or paint',
    summary=results,rows=rows),indent=2)+'\n')
for app,v in results.items():print(app,v['nativeConsumerSavingUs'],v['qjsExtraProducerUs'])
