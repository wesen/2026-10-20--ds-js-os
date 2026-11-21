"""Calculate paired savings and the guard-by-register interaction by pose."""
import json,statistics,sys
from pathlib import Path
from statistics import median

directory=Path(sys.argv[1]);rows=json.loads((directory/'rows.json').read_text());loads=json.loads((directory/'loads.json').read_text())
by_key={(r['fixture'],r['block'],r['program']):r for r in rows}
assert len(by_key)==588==len(rows) and len(loads)==49
poses=sorted({r['fixture'] for r in rows})
arms=[0,9,10,11,12,13,8]
comparisons={'initialAdmissionCost':(9,0),'hoistWhenStack':(9,10),'hoistWhenRegisters':(11,12),
             'registersWhenChecked':(9,11),'registersWhenHoisted':(10,12),'both':(9,12),
             'skip':(12,13),'remainingToPriorMatched':(13,8),'stockToPriorMatched':(0,8)}
output={'unit':'microseconds','blocks':len(rows),'poses':{},'cold':{}}
for prog in arms:
    observed=[r for r in loads if r['program']==prog]
    assert len(observed)==7 and len(set(r['position'] for r in observed))==7
    output['cold'][prog]={k:median(r[k] for r in observed) for k in ['compilerUs','elapsedUs','peakJSBytes','segmentBytes']}
for pose in poses:
    levels={};effects={}
    for i,phase in enumerate(['clean','audit','primary','shade']):
        times=[{arm:by_key[pose,rep,arm]['timesUs'][2][i] for arm in arms} for rep in range(7)]
        levels[phase]={arm:median(t[arm] for t in times) for arm in arms}
        pairs={name:[t[earlier]-t[later] for t in times] for name,(earlier,later) in comparisons.items()}
        pairs['interaction']=[t[10]+t[11]-t[9]-t[12] for t in times]
        effects[phase]={k:{'median':median(v),'min':min(v),'max':max(v)} for k,v in pairs.items()}
    check=[by_key[pose,rep,0] for rep in range(7)]
    cstats={arm: [median(x['timesUs'][idx][p] for x in check) for p in range(4)] for idx,arm in enumerate(['C','C_PIE'])}
    output['poses'][pose]={'levels':levels,'pairedSavings':effects,'controls':cstats}
frequency=[cy/us for r in rows for u,c in zip(r['timesUs'],r['cycles'],strict=True) for us,cy in zip(u,c,strict=True)]
output['coreMHz']=[min(frequency),median(frequency),max(frequency)]
print(json.dumps(output,indent=2))
