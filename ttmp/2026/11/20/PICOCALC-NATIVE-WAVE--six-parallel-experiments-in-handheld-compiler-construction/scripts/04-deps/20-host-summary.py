"""Summarize balanced host blocks with a seeded paired percentile bootstrap within one run."""
import json,random,sys
from statistics import median
from pathlib import Path
source,dest=map(Path,sys.argv[1:]);all_samples=json.loads(source.read_text());rng=random.Random(20261120)
result={}
for app,cells in all_samples.items():
    result[app]={}
    for name,rows in cells.items():
        times={a:[x for x in sorted(rows,key=lambda r:r['block']) if x['arm']==a] for a in ('clean','global','precise')}
        assert all(len(series)==30 for series in times.values())
        delta=[p['total']-g['total'] for p,g in zip(times['precise'],times['global'])]
        resampled=sorted(median(rng.choices(delta,k=30)) for _ in range(10000))
        result[app][name]={'measurementsPerArm':30,'medianMs':{a:{k:median(x[k] for x in series) for k in ('total','compile','link')} for a,series in times.items()},'preciseMinusGlobalMedianPairedMs':median(delta),'bootstrap95WithinRunMs':[resampled[249],resampled[9749]],'medianPairedRatio':median(p['total']/g['total'] for p,g in zip(times['precise'],times['global']))}
dest.write_text(json.dumps(result,indent=2)+'\n')
