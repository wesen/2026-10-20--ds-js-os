"""Independently group all device edit outcomes, compare order-specific heap, and audit identities."""
from collections import Counter
import gzip
import hashlib
import json
import sys
from pathlib import Path
from statistics import median

work=Path(sys.argv[1])
pinned_image_sha=sys.argv[2]
data=json.loads((work/'physical.json').read_bytes())
host=json.loads((work/'host.json').read_bytes())
ticket=Path(__file__).resolve().parents[1]
sha=lambda b: hashlib.sha256(b).hexdigest()
assert data['restored'] and len(data['boots'])==2
binary=(work/'build/picocalc-os-p4.bin').read_bytes()
assert sha(binary)==data['firmware']==pinned_image_sha
manifest=json.loads((ticket/'various/rebuild.json').read_bytes())['stagedManifest']
assert manifest['revision']==data['configuration']['control']
assert manifest['sha256']==data['configuration']['sources']
offsets={}
for path, h in manifest['sha256'].items():
    source=(work/path).read_bytes()
    assert sha(source)==h
    offsets[path]=binary.find(source)
    if not path.endswith('world.js'): assert offsets[path]>=0
reactor=(work/'build/esp-idf/main/files-reactor.elf').read_bytes()
assert sha(reactor)==data['configuration']['reactor'] and reactor in binary
oracle={(r['kind'],r['id']):r for r in host['evidence']}
def mcolumn(rows,metric): return median(r[metric] for r in rows)
output=[]
for i,boot in enumerate(data['boots'],1):
    pairs=Counter((r['kind'],r['id'],r['block'],r['marked']) for r in boot['rows'])
    expected={(k,case,b,marked) for k,case in oracle for b in range(4) for marked in (True,False)}
    assert set(pairs)==expected and all(v==1 for v in pairs.values())
    for r in boot['rows']:
        o=oracle[(r['kind'],r['id'])]
        assert all(r.get(f)==o.get(f) for f in ('sha256','error','mode','built','reused'))
    raw=work/f'boot-{i}.log.gz'
    if i==1 and (work/'boot-1-retry.log.gz').is_file(): raw=work/'boot-1-retry.log.gz'
    log=gzip.decompress(raw.read_bytes()).decode()
    assert log.count('REBUILDROW ')==len(boot['rows']) and log.count('REBUILDGUEST ')==len(boot['guests'])
    assert len(boot['cold'])==4
    result={'rawLogSHA256':sha(raw.read_bytes()),'rows':len(boot['rows']),'coldFilesUs':mcolumn(boot['cold'],'us'),'cases':{}}
    for kind, names in [('files',['seed','exact','relink','body']),('fixture',['body','signature','layout'])]:
        for name in names:
            rows=[r for r in boot['rows'] if (r['kind'],r['id'],r['marked'])==(kind,name,False)]
            obs={'candidateUs':mcolumn(rows,'elapsed'),'cleanUs':mcolumn(rows,'cleanUs'),
                 'pairedSavedUs':median(r['cleanUs']-r['elapsed'] for r in rows)}
            if (kind,name)==('files','body'):
                for clean_first in (True,False):
                    group=[r for r in rows if r['cleanFirst']==clean_first]
                    assert len(group)==2
                    obs['cleanFirst' if clean_first else 'candidateFirst']={
                        column:median(r['heap'][column] for r in group) for column in ('live','peak')}
                guests=[g for g in boot['guests'] if not g['marked'] and g['case']=='body']
                assert len(guests)==4 and all(g['result']==3 and g['units']==[95,65,98] for g in guests)
                obs['loaderUs']=mcolumn(guests,'load_us')
                obs['entryUs']=mcolumn(guests,'run_us')
            result['cases'][kind+'-'+name]=obs
    output.append(result)
print(json.dumps({'firmware':data['firmware'],'scriptOffsets':offsets,'bootAudits':output},indent=2))
