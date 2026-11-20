"""Verify board bytes/witnesses against the host, retain all physical trial cells."""
import json, sys
from pathlib import Path
from statistics import median
from summarize import summarize
p=Path(__file__).resolve().parent
raw=json.loads(Path(sys.argv[1]).read_text())
host=json.loads((p/'results/host-summary.json').read_text())
rows=[r for r in raw['runs'] if r['name']=='nativeprod']
if len(rows)!=56 or [f for f in raw['failures'] if 'nativeprod' in str(f)]:raise ValueError('missing or failed board cells')
seen=set()
for r in rows:
    app,arm=r['arm'].rsplit('-',1); key=(r['block'],r['arm'])
    assert key not in seen and r['block'] in range(7) and r['reps']==r['data']['reps']==8
    seen.add(key)
    for field in ['wireHash','bytes']:assert r['data'][field]==host[app][arm][field]
out=summarize([(r['arm'],r['data']) for r in sorted(rows,key=lambda x:x['block'])])
for app,x in out.items():
    def get(arm):return [r['data']['routeUs']/r['reps'] for r in sorted(rows,key=lambda x:x['block']) if r['arm']==app+'-'+arm]
    g,b=get('G'),get('B')
    x['pairedRouteSavingUs']=[u-v for u,v in zip(g,b)]
    x['medianPairedRouteSavingUs']=median(x['pairedRouteSavingUs'])
    x['rangeBOverG']=[min(v/u for u,v in zip(g,b)),max(v/u for u,v in zip(g,b))]
out={'sourceFirmwareSha256':raw['firmwareSha256'],'experimentFirmwareSha256':raw['experimentSha256'],
     'board':'ESP32-P4','blocks':7,'repsPerBlock':8,'summaries':out,'runs':rows}
Path(sys.argv[2]).write_text(json.dumps(out,indent=2)+'\n')
