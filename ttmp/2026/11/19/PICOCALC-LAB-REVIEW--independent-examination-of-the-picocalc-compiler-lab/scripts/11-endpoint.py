"""Audit continuous edited-source-to-native-return measurements and their compiled inputs."""
import gzip
import hashlib
import json
import sys
from pathlib import Path
from statistics import median

work=Path(sys.argv[1])
receipt=json.loads((work/'physical.json').read_text())
assert len(receipt['boots'])==2 and receipt['restored']
binary=(work/'build/picocalc-os-p4.bin').read_bytes()
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(binary)==receipt['firmware']==sys.argv[2]
host=json.loads((work/'host.json').read_text())
expected,=[r for r in host['evidence'] if (r['kind'],r['id'])==('files','body')]
compilers=receipt['configuration']['sources']
for name,tag in compilers.items():
    source=(work/name).read_bytes()
    assert sha(source)==tag
    if not name.endswith('world.js'): assert source in binary
assert (work/'build/esp-idf/main/files-reactor.elf').read_bytes() in binary
result=[]
for i,boot in enumerate(receipt['boots'],1):
    path=work/f'boot-{i}.log.gz'
    if i==1 and (work/'boot-1-retry.log.gz').is_file(): path=work/'boot-1-retry.log.gz'
    raw=gzip.decompress(path.read_bytes()).decode()
    assert raw.count('ENDPOINTROW ')==12 and 'ENDPOINTDONE' in raw and 'ENDPOINTFAIL' not in raw
    paired={}
    for r in boot['rows']:
        assert [r[k] for k in ('size','sha256','result','units')]==[expected['size'],expected['sha256'],3,[95,65,98]]
        assert r['us']>r['load_us']+r['run_us'] and 0<r['before']<=r['peak']<2*1024**2
        assert r['position']==(r['block']+(r['mode']=='rebuild'))%2
        key=(r['block'],r['mode'])
        assert key not in paired
        paired[key]=r
    assert len(paired)==12
    effects=[]
    metrics={}
    for field in ('us','before','peak','load_us','run_us'):
        a=[paired[b,'clean'][field] for b in range(6)]
        b_=[paired[b,'rebuild'][field] for b in range(6)]
        effects=[y-x for x,y in zip(a,b_)]
        metrics[field]={'clean':median(a),'rebuild':median(b_),'pairedChange':median(effects),
                        'pairRange':[min(effects),max(effects)]}
    result.append({'logSHA256':sha(path.read_bytes()),'metrics':metrics})
print(json.dumps({'firmware':receipt['firmware'],'elf':expected['sha256'],'boots':result},indent=2))
