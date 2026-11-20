"""Summarize alternating producer blocks. Input is the independent host or complete board receipt."""
import json, statistics, sys
from pathlib import Path

def summarize(rows):
    arms = {}
    for label, d in rows:
        name, arm = label.rsplit('-', 1)
        arms.setdefault(name,{}).setdefault(arm,[]).append(d)
    out = {}
    for name,x in arms.items():
        assert len(x['G']) == len(x['B']) and len(x['G']) > 0
        variants={}
        for arm,entries in x.items():
            for e in entries:
                assert e['routeUs']==e['encodeUs']+e['admitUs']+e['lookupUs']+e['releaseUs']
            assert len({(e['bytes'],e['wireHash'],e['walkHash'],e['lookupHash']) for e in entries})==1
            med={k:statistics.median(e[k]/e['reps'] for e in entries)
                 for k in ['encodeUs','admitUs','lookupUs','releaseUs','routeUs']}
            variants[arm]={'bytes':entries[0]['bytes'],'wireHash':entries[0]['wireHash'],'medianUsPerScreen':med}
        assert x['G'][0]['walkHash']==x['B'][0]['walkHash'] and x['G'][0]['lookupHash']==x['B'][0]['lookupHash']
        variants['blocks']=len(x['G'])
        variants['medianPairedRouteBOverG']=statistics.median((b['routeUs']/b['reps'])/(g['routeUs']/g['reps'])
                                                              for b,g in zip(x['B'],x['G']))
        out[name]=variants
    return out

if __name__=='__main__':
    src=Path(sys.argv[1])
    if src.suffix=='.json':
        whole=json.loads(src.read_text())
        rows=[(r['arm'],r['data']) for r in sorted(whole['runs'],key=lambda x:x['block']) if r['name']=='nativeprod']
    else:
        rows=[]
        for line in src.read_text().splitlines():
            label,data=line.split(' ',3)[2:]; rows.append((label,json.loads(data)))
    Path(sys.argv[2]).write_text(json.dumps(summarize(rows),indent=2)+'\n')
