"""Summarize repeated units within poses and compare hardware counters to elapsed time."""
from pathlib import Path
import argparse,json,statistics as st
p=argparse.ArgumentParser(description=__doc__);p.add_argument('run',type=Path);a=p.parse_args()
rows=json.loads((a.run/'rows.json').read_text());loads=json.loads((a.run/'loads.json').read_text())
median=st.median
programs=sorted(set(r['program'] for r in rows))
def summary(observations,arm):
    return {name:round(median(r['timesUs'][arm][i] for r in observations),1)
            for i,name in enumerate(['cleanUs','auditUs','primaryUs','shadeUs'])}
def pose_ratio(rs,arm,other):
    ratios=[r['timesUs'][arm][0]/r['timesUs'][other][0] for r in rs]
    return round(median(ratios),4)
output={'poseBlocks':len(rows),'observedMHz':{},'programs':{},'material':{}}
freq=[r['cycles'][arm][i]/r['timesUs'][arm][i] for r in rows for arm in range(3) for i in range(4)]
output['observedMHz']={k:round(f,2) for k,f in [('min',min(freq)),('median',median(freq)),('max',max(freq))]}
for program in programs:
    rs=[r for r in rows if r['program']==program];ls=[l for l in loads if l['program']==program]
    entry={'N':len(rs),'medianCompilerUs':median(l['compilerUs'] for l in ls),'maxTrackedJSBytes':max(l['quickjsPeakBytes'] for l in ls),'medianAll':summary(rs,2),'default':{},'byPose':{}}
    for name in sorted(set(r['fixture'] for r in rs)):
        pose=[r for r in rs if r['fixture']==name];entry['byPose'][name]={'guest':summary(pose,2),'cScalar':summary(pose,0),'cPIE':summary(pose,1),
          'cleanGuestOverC':pose_ratio(pose,2,0)}
    entry['default']=entry['byPose']['default']
    output['programs'][program]=entry
m=json.loads((a.run/'materials.json').read_text())
for fixture in (0,1):
    arm=[r for r in m if r['fixture']==fixture]
    output['material'][fixture]={k:median(r[k] for r in arm) for k in ['mixedUs','typedUs']}
print(json.dumps(output,indent=2))
