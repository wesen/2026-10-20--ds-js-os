"""Verify complete pixel identities, summarize separately scoped host costs and replay repair cases."""
import csv
from collections import Counter
import gzip
import hashlib
import json
import statistics
import sys
from pathlib import Path

out=Path(sys.argv[1])
def read(name): return json.loads((out/name).read_text())
def rows(p): return list(csv.DictReader(p.open()))
def median(xs): return round(statistics.median(xs),3)
def quant(xs):
    s=sorted(xs)
    return dict(min=round(s[0],3),median=median(s),p95=round(s[(95*len(s)+99)//100-1],3),max=round(max(s),3))
def save(name,value): (out/name).write_text(json.dumps(value,indent=2)+'\n')
def digest(b): return hashlib.sha256(b).hexdigest()

replay=read('replay.json')
capture=replay['observations']
arms=[read(a+'-pixels/receipt.json') for a in ('control','aa','semantic')]
assert all(len(arm)==len(capture) for arm in arms)
pixel_rows=[]
for i,c in enumerate(capture):
    p=arms[0][i]
    for (arm,records) in zip(('control','aa','semantic'),arms):
        r=records[i]
        assert (r['id'],r['pixelSha256'])==(c['id'],p['pixelSha256'])
        data=(out/(arm+'-pixels')/r['filename']).read_bytes()
        assert len(data)==204800 and digest(data)==p['pixelSha256']
        if arm=='control': reference=data
        else: assert data==reference
    pixel_rows.append({'id':c['id'],'rgb565Sha256':p['pixelSha256'],'changed':p['changedPixels']})
save('pixels.json',pixel_rows)
source=[c for c in capture if c['group']!='constructed']
sent=[c for c in source if c['sent']]
sizes={field:dict(total=sum(r[field] for r in sent),**quant([r[field] for r in sent])) for field in ('j','b','sj','t','jEnvelope','sjEnvelope','tEnvelope')}
size_examples={r['id']:{k:r[k] for k in ('n','j','b','sj','t','jEnvelope','sjEnvelope','tEnvelope')}
               for r in capture if r['id'] in ['start','eat','self-collision','auto-200','fixture-300','fixture-395']}
ts=read('timings.json')['timings']
stage={}
for group in ('source','short','long300','nearCap395'):
    stage[group]={k:quant([r['us'] for r in ts if r['group']==group and r['label']==k]) for k in sorted({r['label'] for r in ts})}
trials=[rows(out/f'damage-{i}.csv') for i in range(12)]
for run in trials: assert len(run)==len(capture)
raw='\n'.join((out/f'damage-{i}.csv').read_text().strip() for i in range(12))+'\n'
(out/'raster-trials.csv.gz').write_bytes(gzip.compress(raw.encode(),mtime=0))
sample=trials[0]
for r,p in zip(sample,pixel_rows): assert int(r['changed'])==(p['changed'] if p['changed'] is not None else -1)
moves=[i for i,(c,r) in enumerate(zip(capture,sample)) if c['group']!='constructed' and r['mode']=='partial' and int(r['changed'])>0 and int(r['skipped'])==0]
fallback=[i for i,(c,r) in enumerate(zip(capture,sample)) if c['group']!='constructed' and r['mode']=='full' and i and int(r['changed'])>0]
def raster_summary(group):
    # Quantile population is 12 trial medians, each summary computed across cohort draws.
    times={key:quant([median([float(t[i][key])/1000 for i in group]) for t in trials])
           for key in ('fullPaintNs','damagePaintNs','fullCommitNs','damageCommitNs')}
    return {'framesPerTrial':len(group),'trialMedianUs':{k[:-2]+'Us':v for k,v in times.items()},
            'actualChanged':quant([int(sample[i]['changed']) for i in group]),
            'changedFrequency':dict(sorted(Counter(int(sample[i]['changed']) for i in group).items())),
            'transferredPixels':quant([int(sample[i]['transferPixels']) for i in group])}
scenario={}
for p in sorted(out.glob('scenario-*.csv')):
    rr=rows(p); assert rr
    dropped=next((i for i,x in enumerate(rr) if x['skipped']=='1'),None)
    scenario[p.stem]=dict(verifiedFrames=len(rr),first=rr[0]['id'],last=rr[-1]['id'])
    if dropped is not None:
        scenario[p.stem].update(skip=rr[dropped]['id'],stale=int(rr[dropped]['stalePanelPixels']),
            recovered=rr[dropped+1]['id'],repairPixels=int(rr[dropped+1]['transferPixels']))
examples={r['id']:{k:r[k] for k in ['commands','changed','incrementalWrites','rects','transferPixels','skipped','stalePanelPixels','mode']}
          for r in sample if r['id'] in ['start','eat','move-down','blur','move-left','self-collision','restart','enter-vacated-tail','wall-run-9','enable-autopilot','fixture-395']}
summary={'auditedCompleteFramesPerArm':len(capture),'realInputObservations':len(source),'distinctConsecutivePublications':len(sent),
         'realMaxBody':max(c['n'] for c in source),'constructed':2,'refusals':len(replay['refusals']),'sizeExamples':size_examples,
         'sourceSentSize':sizes,'hostStagesUsPerOperation':stage,'rasterMoves':raster_summary(moves),
         'rasterFullFallback':raster_summary(fallback),'pixelExamples':examples,'additionalCases':scenario,
         'outputSHA256':digest(''.join(r['rgb565Sha256'] for r in pixel_rows).encode()),
         'node':read('timings.json')['node'],'v8':read('timings.json')['engine']}
save('summary.json',summary)
print(json.dumps({k:v for k,v in summary.items() if k!='hostStagesUsPerOperation'},indent=2))
