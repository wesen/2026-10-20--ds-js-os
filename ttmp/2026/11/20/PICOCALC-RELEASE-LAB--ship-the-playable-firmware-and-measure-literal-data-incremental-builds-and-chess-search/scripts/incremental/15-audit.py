"""Independently parse board transcript and compare phase counts, checksums, reuse and released firmware."""
import json
from pathlib import Path
import sys
here=Path(__file__).resolve().parent
uart=Path(sys.argv[1]).read_text(errors='replace').splitlines()
evidence=json.loads(Path(sys.argv[2]).read_text())
gold=json.loads(Path(sys.argv[3]).read_text())
rows=[json.loads(s[len('INC_ROW '):]) for s in uart if s.startswith('INC_ROW ')]
assert rows==evidence['rows'] and len(rows)==44
assert 'INC_BEGIN mounted=1' in uart and 'INC_DONE ok' in uart
for app,n in [('editor',119),('chess',82)]:
    group=[r for r in rows if r['app']==app]
    assert len(group)==22
    for key in ['body','signature','layout']:
        for i in range(3):
            observed=[r for r in group if r.get('i')==i and r['key']==key]
            assert {r['arm'] for r in observed}=={'clean','ram'} and len(observed)==2
            assert all(r['crc']==gold[app][key] and r['us']>0 for r in observed)
            ram=next(r for r in observed if r['arm']=='ram')
            assert ram['reused']==(n-1 if key=='body' else 0) and ram['rebuilt']==n-ram['reused']
    ck=next(r for r in group if r['key']=='restore')
    assert ck['persisted'] and min(ck[k] for k in ['bytes','writeUs','readUs','decodeUs','encodeUs','childUs'])>0
    assert ck['checkpointToEditedElfUs']>=sum(ck[k] for k in ['writeUs','readUs','decodeUs','encodeUs','childUs'])
    for arm in ('clean','fragment'):
        s=next(x for x in uart if x.startswith('INC_COLD '+app+' '+arm+' '))
        _,_,_,us,peak,crc=s.split()
        assert int(crc)==gold[app]['base'] and int(us)>0 and int(peak)>0
assert evidence['qualified'] and evidence['restoredReadback'] and evidence['restoredPainter']['installed']
assert not evidence['restoredPainter']['rejects'] and len(evidence['restoredWorlds'])>=8
print('44 raw physical rows, 4 independent clean CRCs, 2 synced checkpoints, release readback and healthy painter verified')
