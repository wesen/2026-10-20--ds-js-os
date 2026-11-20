"""Aggregate the indexed binary comparison; compare the same operation in each runtime."""
import argparse,json,statistics as S
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('wave',type=Path);p.add_argument('output',type=Path);p.add_argument('--sender',type=Path);a=p.parse_args()
d=json.loads(a.wave.read_text());assert len(d['runs'])==140 and not d['failures']
e=json.loads(a.sender.read_text()) if a.sender else None
if e:assert len(e['runs'])==56 and not e['failures']
out={'JS':{},'receiverC':{},'nativeRoute':{},'receiverImageSHA256':d['experimentSha256'],'blocks':7}
def rows(d,name,app,arms):
    g={}
    for arm in arms:
        samples=sorted([r for r in d['runs'] if r['name']==name and r['arm']==app+'-'+arm],key=lambda r:r['block'])
        assert [r['block'] for r in samples]==list(range(7))
        g[arm]=[r['data'] for r in samples]
    return g
def aggregate(g,tasks):
    result={}
    for arm,rs in g.items():
        result[arm]={k:S.median([sum(r[f] for f in fields)/r['reps']/1000 for r in rs]) for k,fields in tasks.items()}
    baseline=g['G']
    for k,fields in tasks.items():
        val=lambda r:sum(r[f] for f in fields)/r['reps']
        result.setdefault('pairedBinaryVsG',{})[k]=S.median(val(x)/val(y) for x,y in zip(g['B'],baseline) if val(y)>0)
    return result
for app in ['sysmon','chess','snake','editor']:
    q=rows(d,'binary',app,['P','G','B']);c=rows(d,'nativebin',app,['G','B'])
    for i in range(7):
        for field in ['lookupHash','repeatLookupHash','walkHash','paintCommands','paintHash','repeatPaintHash']:
            assert len({q[k][i][field] for k in q})==1,(app,field)
        for field in ['lookupHash','repeatLookupHash','walkHash']:
            assert c['G'][i][field]==c['B'][i][field]
    out['JS'][app]=aggregate(q,{'encode':['encodeUs'],'admit':['admitUs'],'lookup':['lookupUs'],'paint':['paintUs'],'encodeAdmitPaint':['encodeUs','admitUs','paintUs']})
    out['receiverC'][app]=aggregate(c,{'admit':['admitUs'],'lookup':['lookupUs'],'full':['walkUs'],'release':['releaseUs'],'admitFullRelease':['admitUs','walkUs','releaseUs']})
    if e:
        s=rows(e,'nativeprod',app,['G','B'])
        for i in range(7):
            for f in ['lookupHash','walkHash']:
                assert s['G'][i][f]==s['B'][i][f]
        out['nativeRoute'][app]=aggregate(s,{'encode':['encodeUs'],'admit':['admitUs'],'lookup':['lookupUs'],'route':['routeUs']})
if e:out['producerImageSHA256']=e['experimentSha256']
a.output.write_text(json.dumps(out,indent=2)+'\n')
