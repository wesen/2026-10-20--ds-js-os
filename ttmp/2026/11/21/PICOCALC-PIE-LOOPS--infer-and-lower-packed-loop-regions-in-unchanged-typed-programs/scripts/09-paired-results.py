"""Summarize medians and within-block treatment differences in P4 microseconds."""
import json
import sys
from pathlib import Path
from statistics import median

root=Path(sys.argv[1])
rows=json.loads((root/'rows.json').read_text())
loads=json.loads((root/'loads.json').read_text())
times={(r['fixture'],r['block'],r['program']):r['timesUs'][2] for r in rows}
assert len(rows)==len(times)==216 and len(loads)==18
for arm in (0,8,5):
    selected=[r for r in loads if r['program']==arm]
    assert sorted(r['position'] for r in selected)==[0,0,1,1,2,2]
names={0:'stock',8:'scalar',5:'pie'}
def stats(sample):
    return {'median':median(sample),'min':min(sample),'max':max(sample)}
summary={'unit':'microseconds','blocks':len(rows),'cold':{},'poses':{}}
for arm,name in names.items():
    runs=[r for r in loads if r['program']==arm]
    summary['cold'][name]={k:median(r[k] for r in runs) for k in ('compilerUs','peakJSBytes','segmentBytes')}
for pose in sorted({r['fixture'] for r in rows}):
    phases={}
    for j,phase in enumerate(('clean','audit','primary','shade')):
        by_arm={arm:[times[pose,b,arm][j] for b in range(6)] for arm in names}
        comparisons={}
        for a,b in [(0,8),(8,5),(0,5)]:
            pairs=list(zip(by_arm[a],by_arm[b],strict=True))
            comparisons[names[a]+'To'+names[b].title()]={'savedUs':stats([l-r for l,r in pairs]),
                'savedPct':stats([100*(l-r)/l for l,r in pairs])}
        phases[phase]={'levelUs':{names[a]:median(ts) for a,ts in by_arm.items()},'paired':comparisons}
    summary['poses'][pose]=phases
print(json.dumps(summary,indent=2))
