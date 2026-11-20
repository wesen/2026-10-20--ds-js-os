"""Recalculate the command identity and paired cycle differences from device receipts."""
import argparse
import json
from pathlib import Path
from statistics import median

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('capture',type=Path)
parser.add_argument('native_words',type=Path)
args=parser.parse_args()
data=json.loads((args.capture/'receipt.json').read_text())
assert data['qualified'] and data['compiled']['match']
assert data['compiled']['sourceSha256']=='27620f6de0cab545c37ca565fd0cfc2ad1808b1b1575c76c8aef311abf54c458'
rows=[]
for name,wordname,cursor in [('e2','game-0',52),('e3','e3',44),('f3','f3',45)]:
    screen=data['screens'][name]
    timing=screen['paired']
    witness=screen['witness']
    words=(args.native_words/(wordname+'.words')).read_bytes()
    fnv=2166136261
    for value in words:
        fnv=((fnv^value)*16777619)&0xffffffff
    assert timing['scene']['fnv']==f'{fnv:08x}'
    assert timing['scene']['cursor']==cursor and timing['scene']['words']*2==len(words)
    assert witness=={'value':'abcd','stride':192,'capacity':82,'words':len(words)//2}
    arms=[timing[a] for a in ('guarded-rv32','raw-pie')]
    for arm in arms:
        assert arm['callsPerSample']==8 and len(arm['samples'])==11 and median(arm['samples'])==arm['median']
    g,v=[arm['samples'] for arm in arms]
    diffs=[a-b for a,b in zip(g,v)]
    rows.append({'name':name,'core':timing['scene']['core'],'commandFNV':f'{fnv:08x}',
                 'guardedMedian':median(g),'pieMedian':median(v),'pairedMedianCyclesSaved':median(diffs),
                 'pairedMedianPercentSaved':round(median((a-b)*100/a for a,b in zip(g,v)),3),
                 'pieWins':sum(d>0 for d in diffs),'ties':sum(d==0 for d in diffs),
                 'minCyclesSaved':min(diffs),'maxCyclesSaved':max(diffs)})
print(json.dumps({'image':data['firmware'],'positions':rows},indent=2))
