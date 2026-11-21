"""Summarize the held-out shadow forecast against paired on-device baseline clocks."""
import json,sys
from pathlib import Path
from statistics import median
r=json.loads((Path(sys.argv[1])/'rows.json').read_text())
assert len(r)==192
by={(x['fixture'],x['block'],x['program']):x for x in r};assert len(by)==192
out={}
for pose in sorted({x['fixture'] for x in r}):
    effects={}
    for i,k in enumerate(('clean','audit','primary','shade')):
        pairs=[tuple(by[pose,rep,prog]['timesUs'][2][i] for prog in (0,14)) for rep in range(8)]
        changes=[a-b for a,b in pairs]
        effects[k]={'stockUs':median(a for a,b in pairs),'candidateUs':median(b for a,b in pairs),
                    'savedUs':median(changes),'savedRangeUs':[min(changes),max(changes)],
                    'savedPercent':median(100*(a-b)/a for a,b in pairs)}
    out[pose]=effects
print(json.dumps(out,indent=2))
