"""Pair the ordered board observations and check all target checksums and the release-state receipt."""
from pathlib import Path
from statistics import median
import json,sys
p,g,out=map(Path,sys.argv[1:]); hw=json.loads(p.read_text()); gold=json.loads(g.read_text())
assert hw['qualified'] and hw['restoredReadback'] and hw['restoredPainter']['installed'] and not hw['restoredPainter']['rejects']
assert len(hw['rows'])==90 and len(hw['cold'])==4
summary={'candidate':hw['candidate'],'release':hw['release'],'partition':hw['partition'],'memory':hw['memory'],'cold':hw['cold'],'cells':{}}
for app in ('editor','chess'):
    cells=summary['cells'][app]={}
    for key in ('body','signature','layout'):
        rows=[x for x in hw['rows'] if x['app']==app and x['key']==key]
        assert len(rows)==15 and all(x['crc']==gold[app][key] for x in rows)
        arms={}
        for arm in ('clean','global','precise'):
            ordered=sorted((r for r in rows if r['arm']==arm),key=lambda r:r['block'])
            assert [r['block'] for r in ordered]==list(range(5))
            arms[arm]=[r['us']/1000 for r in ordered]
        precise=[r for r in rows if r['arm']=='precise']
        assert len({(r['reused'],r['rebuilt']) for r in precise})==1
        cells[key]={'medianMs':{a:median(t) for a,t in arms.items()},'rawMs':arms,
            'preciseToGlobalMedianPairedRatio':median(p/g for p,g in zip(arms['precise'],arms['global'])),
            'preciseToCleanMedianPairedRatio':median(p/c for p,c in zip(arms['precise'],arms['clean'])),
            'winsVsGlobal':sum(p<g for p,g in zip(arms['precise'],arms['global'])),
            'winsVsClean':sum(p<c for p,c in zip(arms['precise'],arms['clean'])),
            'reuse':precise[0]['reused'],'build':precise[0]['rebuilt']}
out.write_text(json.dumps(summary,indent=2)+'\n')
