"""Pair recorded samples by workload and block; distinguish compiler, process and storage endpoints."""
import argparse
import json
from pathlib import Path
from statistics import median

here=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('physical',type=Path)
parser.add_argument('out',type=Path)
args=parser.parse_args()
host=json.loads((here/'host.json').read_text())['apps']
hw=json.loads(args.physical.read_text())
assert hw['qualified']
if hw.get('restoredPainter'): assert hw['restoredReadback'] and hw['restoredPainter']['installed']
summary={'releaseReadbackVerified':hw.get('restoredReadback',False),'playablePainterVerified':bool(hw.get('restoredPainter',{}).get('installed')),'configuration':{'host':'Node/V8, 5 rotated blocks; public compile plus hash/metadata; fsync+rename+directory sync in disk arm',
                          'board':'ESP32-P4 360 MHz QuickJS native lexer; 3 alternating pairs/edit in one boot; complete linked ELF return, correctness checks outside compiler clock',
                          'currentApplicationPolicy':{'heapBytes':4*1024*1024,'deadlineUs':6000000}},'apps':{}}
for app,data in host.items():
    results={'hostMs':{},'board':{},'fresh':{},'diagnostic':data['observations']['bad']['diagnostic']}
    board=[r for r in hw['rows'] if r['app']==app]
    for key in ('base','body','signature','layout'):
        h=[r for r in data['trials'] if r['child']==key]
        results['hostMs'][key]={a:round(median(r['total'] for r in h if r['arm']==a),3) for a in ('clean','ram','disk','cold-cache')}
        if key=='base':continue
        rows={arm:sorted((r for r in board if r.get('key')==key and r.get('arm')==arm),key=lambda r:r['i']) for arm in ('clean','ram')}
        assert all([r['i'] for r in rows[x]]==[0,1,2] for x in rows)
        assert all(r['crc']==rows['clean'][0]['crc'] for r in rows['ram']+rows['clean'])
        paired=list(zip(rows['clean'],rows['ram']))
        results['board'][key]={'cleanUs':median(x['us'] for x,y in paired),'ramUs':median(y['us'] for x,y in paired),
                                'pairedRatio':round(median(y['us']/x['us'] for x,y in paired),5),
                                'wins':sum(y['us']<x['us'] for x,y in paired),
                                'reused':rows['ram'][0]['reused'],'rebuilt':rows['ram'][0]['rebuilt']}
    for row in [x for x in hw['cold'] if x['app']==app]:results['fresh'][row['arm']]={k:row[k] for k in ('us','peakBytes','crc')}
    results['checkpoint']=next(r for r in board if r.get('key')=='restore')
    results['warmHarnessPeak']=hw['memory'][app]
    summary['apps'][app]=results
args.out.write_text(json.dumps(summary,indent=2)+'\n')
