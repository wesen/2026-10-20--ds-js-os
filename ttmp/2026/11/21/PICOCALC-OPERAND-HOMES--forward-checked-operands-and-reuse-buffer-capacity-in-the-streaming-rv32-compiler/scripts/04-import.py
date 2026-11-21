"""Check physical run completeness, validate image identity and retain reproducible rows."""
from pathlib import Path
import collections,hashlib,json,sys
t=Path(__file__).resolve().parents[1];run=Path(sys.argv[1]);g=Path(sys.argv[2]);v=t/'various'
raw=(run/'bench.log').read_bytes()
assert b'SIMDLAB END' in raw and b'SHERROR' not in raw
man=json.loads((g/'manifest.json').read_text())
rows=[]
for l in raw.decode(errors='replace').splitlines():
 if l.startswith('SHROW '):
  _,kind,fixture,phase,b,arm,*values=l.split()
  calls=1 if kind=='frame' else int(values[0])
  rows.append(dict(kind=kind,fixture=fixture,phase=int(phase),block=int(b),arm=int(arm),value=int(values[-1])/calls))
 if l.startswith('SHCOLD '):
  r=json.loads(l[7:]);assert r['match'] and r['bytes']==man['records'][2*r['arm']+r['family']]['bytes']
  for metric in ('compileUs','totalUs','peakBytes'):
   rows.append(dict(kind=metric,fixture=str(r['family']),phase=0,block=r['block'],arm=r['arm'],value=r[metric]))
counts=collections.Counter(r['kind'] for r in rows)
assert counts==dict(pred=16*6*8,frame=12*6*6*3,chess=72,compileUs=60,totalUs=60,peakBytes=60),counts
assert len({(r['kind'],r['fixture'],r['phase'],r['block'],r['arm']) for r in rows})==len(rows)
after=json.loads((run/'after.json').read_text())
assert after['sha256']=='e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5'
profiles=[json.loads((v/'profiles'/(a+'.json')).read_text()) for a in ['control','forward','capacity','both','homes']]
for i,p in enumerate(profiles):
 assert man['records'][2*i]['sha']==p['imageSHA'] and p['outputSHA']==profiles[0]['outputSHA']
(v/'rows.json').write_text(json.dumps(rows,separators=(',',':'))+'\n')
(v/'images.json').write_text(json.dumps(man,indent=2)+'\n')
(v/'receipt.json').write_text(json.dumps(dict(counts=counts,image=json.loads((run/'image.json').read_text()),restored=after['sha256'],worlds=after['health']['worlds'],logSHA=hashlib.sha256(raw).hexdigest()),indent=2)+'\n')
