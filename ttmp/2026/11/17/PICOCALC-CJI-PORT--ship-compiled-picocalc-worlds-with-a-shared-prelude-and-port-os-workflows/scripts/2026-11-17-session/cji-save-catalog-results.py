from pathlib import Path
import hashlib, json, re
t=Path('/tmp')
root=Path('picocalc-os/js')
worlds=json.loads((root/'system.json').read_bytes())['worlds']
evidence=next(Path('ttmp/2026/11/17').glob('*PORT--*/various'))
fw={'baseline':'0fb80be375d0f90c1c9b634f8be751a9c17d1fa06c0af14862afc7d52e78a78b','instrumented':'5ca8eb6ef46930a1f35c2e353ddde550a45e8683cce4e84ad017b2a0d8eddecd','reserved':'e46c655 (code revision, separate inflate buffer)','shared':'e72bc108aa7a5dfefae43a684492fab8c49225b73407a6de3947757c5d600000'}
rows={}
for w in worlds:
    name=w['name']
    src=(root/w['file']).read_bytes()
    elf=t/'p4-catalog-reference'/(name+'.elf')
    rows[name]=dict(world=name,file=w['file'],source_sha256=hashlib.sha256(src).hexdigest(),source_bytes=len(src),runs=[])
    if elf.exists():
        rows[name]['host_elf_sha256']=hashlib.sha256(elf.read_bytes()).hexdigest()
    else:
        host=next(l for l in (t/'cji-catalog-host.log').read_text().splitlines() if l.startswith(name+' '))
        rows[name]['host_error']=host.split(' ',1)[1]
def record(row, config):
    row=row.copy()
    r=rows[row.pop('world')]
    for key in ('file','source_sha256','source_bytes'):
        assert row.pop(key)==r[key]
    if row['result']=='ok':
        assert row['elf_sha256']==r['host_elf_sha256']
    r['runs'].append(dict(firmware=config,**row))
for config,path in [('baseline','cji-catalog-device'),('baseline','cji-catalog-editor'),('instrumented','cji-catalog-measured'),('reserved','cji-agent-first'),('shared','cji-agent-second'),('shared','cji-catalog-second'),('shared','cji-catalog-second-replay')]:
    p=t/(path+'.jsonl')
    if p.exists():
        for line in p.read_text().splitlines():
            record(json.loads(line),config)
log=(t/'cji-agenda-recovery.log').read_text()
reason=dict(re.findall(r'(\w+)=(\w+)',re.search(r'^cji: allocation refused .*',log,re.M).group()))
m=re.search(r'cji: check failed elapsed_ms=(\d+) scratch_peak=(\d+) source_sha256=(\w+) error=([^\n]+)',log)
assert rows['agenda']['source_sha256']==m[3]
rows['agenda']['runs'].append(dict(firmware='instrumented',result='failed',elapsed_ms=int(m[1]),scratch_bytes=int(m[2]),allocation_refusal={k:int(v) if v.isdigit() else v for k,v in reason.items()},diagnostic=m[4]))
missing=[r['world'] for r in rows.values() if not r['runs']]
print('Missing',missing)
if not missing:
    (evidence/'device-catalog-results.json').write_text(json.dumps(dict(firmware=fw,worlds=list(rows.values())),indent=2)+'\n')
