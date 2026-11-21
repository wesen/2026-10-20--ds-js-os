"""Score every cold-independent matched timing in the second P4 experiment."""
from pathlib import Path
import argparse,collections,json,statistics
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('log',type=Path);p.add_argument('out',type=Path);args=p.parse_args()
data=args.log.read_text(errors='replace').splitlines()
assert not any(s.startswith(('DFERROR','DGERROR')) for s in data)
def get(tag):
    return [json.loads(s[len(tag)+1:]) for s in data if s.startswith(tag+' ')]
rows=get('DFROW');gate=get('DGROW')
def pairs(a,b):
    assert len(a)==len(b)==6
    return dict(before=statistics.median(a),after=statistics.median(b),saved=statistics.median([x-y for x,y in zip(a,b)]),
                pct=statistics.median([100*(x-y)/x for x,y in zip(a,b)]),wins=sum(x>y for x,y in zip(a,b)))
def write(n,v): (args.out/(n+'.json')).write_text(json.dumps(v,indent=2)+'\n')
assert len(rows)==432 and len(gate)==234
frames=json.loads((args.out/'frame-fixtures.json').read_text())
r={(x['fixture'],x['phase'],x['block'],x['arm']):x for x in rows}
assert len(r)==432 and all(x['us']>0 and x['cycles']>0 for x in rows)
results=[]
for f in frames:
    for phase in (0,1):
        treatments=[[r[f['fixture'],phase,b,a]['us'] for b in range(6)] for a in range(3)]
        entry={'pose':f['fixture'],'phase':['clean','primary'][phase]}
        for name,i,j in [('empty',0,1),('full',0,2),('incrementalFull',1,2)]:entry[name]=pairs(treatments[i],treatments[j])
        results.append(entry)
g={(x['n'],x['block'],x['arm']):x['cycles']/x['calls'] for x in gate}
assert len(g)==234
lengths=[]
for n in [0,1,3,5,7,8,9,15,16,17,33,96,127]:
    times=[[g[n,b,a] for b in range(6)] for a in range(3)]
    med=list(map(statistics.median,times)); best=min(med[:2])
    lengths.append({'n':n,'medians':dict(zip(['stock','pie','gated'],med)),'gateOverBestFixedPct':100*(med[2]/best-1),
                    'pieOverBestFixedPct':100*(med[1]/best-1),'gateVsPie':pairs(times[1],times[2])})
write('frame-device-rows',rows);write('gate-device-rows',gate);write('frame-result',results);write('gate-result',lengths)
for ph in ('clean','primary'):
    v=[e for e in results if e['phase']==ph]
    print(ph,'default',v[0], 'range vs baseline',[(k,min(e[k]['pct'] for e in v),max(e[k]['pct'] for e in v))for k in ('empty','full')])
print('gate',[(e['n'],round(e['gateOverBestFixedPct'],2)) for e in lengths])
