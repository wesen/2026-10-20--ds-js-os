"""Validate checksums across all stage treatments and tabulate paired device intervals."""
import argparse, collections, json, statistics as S
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('run',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
d=json.loads((a.run/'physical.json').read_text())
assert not d['failures'] and len(d['runs'])==140
def arms(name):
    group=collections.defaultdict(list)
    for r in d['runs']:
        if r['name']==name:group[r['arm']].append(r['data'])
    assert all(len(rows)==5 for rows in group.values())
    return group
out={'firmware':d['experimentSha256'],'playable':d['firmwareSha256'],'restored':d.get('restored',False),'blocks':5,'runs':140,'uploadMs':d['serialUploadMs']}
rd=arms('reader');out['reader']={}
for app in ['sysmon','snake','chess']:
    for b in range(5):
        vals=[rd[app+'-'+op][b]['sum'] for op in ['native','index','both','key','sparse']]
        assert vals[0]==vals[1]==vals[2] and vals[3]==vals[4]
    out['reader'][app]={}
    for op in ['native','index','both','key','sparse']:
        rr=rd[app+'-'+op]
        f=lambda x:(x['buildUs']+x['accessUs'])/x['reps']
        times=list(map(f,rr));out['reader'][app][op]={'medianUs':S.median(times),'rangeUs':[min(times),max(times)],'bytes':rr[0]['bytes'],'tokens':rr[0]['tokens']}
    out['reader'][app]['pairedIndexNative']=S.median([(f(x)/f(y)) for x,y in zip(rd[app+'-index'],rd[app+'-native'])])
for name in ['sysmon','snake','chess','producer','view']:
    out[name]={}
    for op,rows in arms(name).items():
        v=rows[0]
        stats={k:S.median([x[k] for x in rows]) for k in v if isinstance(v[k],(int,float))}
        if 'sumEventUs' in v:stats['medianEventUs']=[S.median(x['sumEventUs'][i]/(1 if i==0 else x['reps']) for x in rows) for i in range(7)]
        if 'producerUs' in v:stats['pairedStageSumUs']=S.median(x['producerUs']+x['receiverUs'] for x in rows)
        out[name][op]=stats
out['liveTrace']={}
for app in ['chess','sysmon','snake','editor']:
    lines=json.loads((a.run/f'trace-{app}.json').read_text())
    assert lines[-1].split()[-1]=='0'
    rows=[]
    for line in lines[:-1]:
        lab,tag,start,us,size,role,event=line.split(' ',6)
        rows.append([int(start),int(us),int(size),role,event])
    # Select first attributed application publication after the first compositor key,
    # then the next compositor draw and the pixel transactions it issues.
    keys=[r for r in rows if r[3:]==['compositor','keys']]
    pubs=[r for r in rows if keys and r[0]>=keys[0][0] and r[3:]==[app,'render+publish']]
    if not pubs:out['liveTrace'][app]={'attributed':False};continue
    pub=pubs[0];recv=next(r for r in rows if r[0]>=pub[0] and r[3:]==['compositor','frames'])
    draw=next(r for r in rows if r[0]>=recv[0] and r[3:]==['compositor','draw'])
    diff=next(r for r in rows if draw[0]<=r[0]<=sum(draw[:2]) and r[3:]==['graphics','commit'])
    sends=[r for r in rows if r[0]>=draw[0]+draw[1] and r[3:]==['spi','pixel-send']][:diff[2]]
    assert len(sends)==diff[2] and sends
    out['liveTrace'][app]={'attributed':True,'keyThroughLastTransferUs':sum(sends[-1][:2])-keys[0][0],
        'producerRenderPublishUs':pub[1],'bytes':pub[2],'receiveEventUs':recv[1],'drawEventUsIncludingCommit':draw[1],
        'commitUs':diff[1],'rects':diff[2],'spiPixelBytes':sum(r[2] for r in sends),'spiPixelBusyUs':sum(r[1] for r in sends)}
a.output.write_text(json.dumps(out,indent=2)+'\n')
