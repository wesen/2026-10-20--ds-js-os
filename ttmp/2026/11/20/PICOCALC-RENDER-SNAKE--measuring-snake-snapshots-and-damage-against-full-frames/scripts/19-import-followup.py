"""Insert a public Opus-authored follow-up at the agreed article and diary boundaries."""
import hashlib
import json
import sys
from pathlib import Path

ticket=Path(__file__).resolve().parent.parent
kind,rawfile=sys.argv[1:]
assert kind in ('tail','board')
raw=json.loads(Path(rawfile).read_text())
r=next(m for m in reversed(raw) if m['type']=='result') if isinstance(raw,list) else raw
assert not r.get('is_error') and any('opus' in name for name in r['modelUsage'])
res=r['result'].strip()
if res.startswith('```json') and res.endswith('```'): res=res[7:-3].strip()
parts=json.loads(res)
assert set(parts)==({'article','diary'} if kind=='tail' else {'opening','article','close','diary'})
article=next((ticket/'analysis').glob('01-*'))
diary=next((ticket/'reference').glob('02-*'))
sha=lambda b:hashlib.sha256(b).hexdigest()
def digest(p): return sha((p.read_text().split('\n---\n',1)[1].strip()+'\n').encode())
previous='revision' if kind=='tail' else 'tail'
prior=json.loads((ticket/f'various/opus-{previous}-receipt.json').read_text())
assert digest(article)==prior['articleSha256'] and digest(diary)==prior['diarySha256']
s=article.read_text()
def replace(s,a,b,new):
    assert s.count(a)==1 and s.count(b)==1
    i=s.index(a);j=s.index(b,i)
    return s[:i]+new.strip()+'\n\n'+s[j:]
if kind=='tail':
    s=replace(s,'On an ordinary move, the partial painter wrote','A collision in the source trace',parts['article'])
    brief='18-tail-brief.txt'
else:
    s=replace(s,'The measurements below were taken on the host.','## The game under study',parts['opening'])
    s=s.replace('## Painting only the cells that changed',parts['article'].strip()+'\n\n## Painting only the cells that changed')
    s=replace(s,'Exact equality and source replay justify testing','## Recommendation',parts['close'])
    brief='20-board-brief.txt'
article.write_text(s)
diary.write_text(diary.read_text().rstrip()+'\n\n'+parts['diary'].strip()+'\n')
receipt=dict(model=list(r['modelUsage']),effort='high',turns=r['num_turns'],stop=r['stop_reason'],
             promptSha256=sha((ticket/'scripts'/brief).read_bytes()),
             publicReplySha256=sha(r['result'].strip().encode()),previousReceipt=f'opus-{previous}-receipt.json',
             articleSha256=digest(article),diarySha256=digest(diary))
(ticket/f'various/opus-{kind}-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
