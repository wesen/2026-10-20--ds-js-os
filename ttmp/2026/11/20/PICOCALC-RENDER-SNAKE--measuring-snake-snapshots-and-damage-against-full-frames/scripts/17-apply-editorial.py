"""Apply only the commissioned author's exact text to reviewed locations in the original draft."""
import hashlib
import json
import sys
from pathlib import Path

d=Path(__file__).resolve().parent.parent
raw=json.loads(Path(sys.argv[1]).read_text())
r=next(m for m in reversed(raw) if m['type']=='result') if isinstance(raw,list) else raw
assert not r.get('is_error') and any('opus' in name for name in r['modelUsage'])
result=r['result'].strip()
if result.startswith('```json') and result.endswith('```'): result=result[7:-3].strip()
p=json.loads(result)
required={'opening','route','wire','memory','fallback','recovery','close','recommendation','diaryTurn','diaryMemory'}
assert set(p)==required and all(isinstance(v,str) and v.strip() for v in p.values())
report=next((d/'analysis').glob('01-*'))
diary=next((d/'reference').glob('02-*'))
def body_hash(file):
    body=file.read_text().split('\n---\n',1)[1].strip()+'\n'
    return hashlib.sha256(body.encode()).hexdigest()
def replace(s,a,b,v):
    assert s.count(a)==1 and s.count(b)==1,(a,b)
    i=s.index(a);j=s.index(b,i)
    return s[:i]+v.strip()+'\n\n'+s[j:]
for path,receipt in [(report,'opus-article-receipt.json'),(diary,'opus-diary-receipt.json')]:
    assert body_hash(path)==json.loads((d/'various'/receipt).read_text())['textSha256']
s=report.read_text()
s=replace(s,'This article follows one real turn','## The game under study',p['opening'])
s=replace(s,'2. The app builds a UI tree','The board origin was verified',p['route'])
s=replace(s,'```\n01 01 05 00 FL','T contains no direction',p['wire'])
s=replace(s,'Several things were not measured.','On the C side',p['memory'])
s=replace(s,'It falls back to a full paint','The full-paint control and the partial painter',p['fallback'])
# Make the new paragraph a paragraph even when the preceding scope statement was on the same line.
s=s.replace('cells that differ. '+p['fallback'].strip(),'cells that differ.\n\n'+p['fallback'].strip())
s=replace(s,'**Lost records.**','**Skipped flushes.**',p['recovery'])
s=replace(s,'The hosted runs measured the following.','## Recommendation',p['close'])
s=replace(s,'I recommend evaluating the simpler','## Reproduction',p['recommendation'])
report.write_text(s)
s=diary.read_text()
s=s.replace('self-collision at length 5 after up, down and left, ','')
s=s.replace('The p key toggled autopilot.',p['diaryTurn']+' The p key toggled autopilot.')
s += '\n'+p['diaryMemory'].strip()+'\n'
diary.write_text(s)
sha=lambda b:hashlib.sha256(b).hexdigest()
receipt=dict(model=list(r['modelUsage']),effort='high',turns=r['num_turns'],stop=r['stop_reason'],
             promptSha256=sha((d/'scripts/16-editorial-brief.txt').read_bytes()),
             publicReplySha256=sha(r['result'].strip().encode()),beforeRevision='d581997',
             articleSha256=body_hash(report),diarySha256=body_hash(diary))
(d/'various/opus-revision-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
