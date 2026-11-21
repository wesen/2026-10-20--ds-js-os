"""Verify and compact the matched board visit; keep the prior measurement traceable."""
from pathlib import Path
import collections,hashlib,json,sys
t=Path(__file__).resolve().parents[1];p=Path(sys.argv[1]);old=next(t.parent.glob('PICOCALC-SHADOW-CODEGEN--*'))
log=(p/'bench.log').read_bytes()
assert b'SIMDLAB END' in log and b'SHERROR' not in log
paths=json.loads((old/'various/board/paths.json').read_text())
rows=[];seen=set()
for ln in log.decode(errors='replace').splitlines():
    if not ln.startswith('SHROW pred '):continue
    _,_,pose,k,b,a,n,cycles=ln.split()
    k,b,a,n,cycles=map(int,[k,b,a,n,cycles]);key=pose,k,b,a
    assert key not in seen and 0<=b<6 and 0<=a<6 and cycles>0 and n>0
    seen.add(key);rows.append(dict(pose=pose,path=k,block=b,arm=a,calls=n,cycles=cycles))
expected={(r['fixture'],-1,b,a) for r in paths for b in range(6) for a in range(6)}
expected.update(('default',k,b,a) for k in range(4) for b in range(6) for a in range(6))
assert seen==expected
for row in rows:
    if row['path']==-1:assert row['calls']==sum(next(r for r in paths if r['fixture']==row['pose'])['patterns'].values())
after=json.loads((p/'after.json').read_text());assert after['sha256']=='e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5'
out=t/'various/device';out.mkdir(exist_ok=True)
(out/'rows.json').write_text(json.dumps(rows,separators=(',',':'))+'\n')
(out/'receipt.json').write_text(json.dumps(dict(rows=len(rows),image=json.loads((p/'image.json').read_text()),restored=after['sha256'],worlds=after['health']['worlds'],benchSHA=hashlib.sha256(log).hexdigest()),indent=2)+'\n')
