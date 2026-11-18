from pathlib import Path
import hashlib,json,re
p=next(Path('ttmp/2026/11/17').glob('*PORT--*/various/device-catalog-results.json'))
d=json.loads(p.read_text())
r=json.loads(Path('/tmp/nov18-final-agenda.jsonl').read_bytes())
w=next(w for w in d['worlds'] if w['world']=='agenda')
assert r['result']=='ok' and r['frontend_reserved_bytes']==8388608
assert r['source_sha256']==hashlib.sha256((Path('picocalc-os/js')/w['file']).read_bytes()).hexdigest()
elf=Path('/tmp/p4-catalog-reference/agenda.elf').read_bytes()
assert r['elf_sha256']==hashlib.sha256(elf).hexdigest()==w['host_elf_sha256'] and r['elf_bytes']==len(elf)
for k in ('world','file','source_sha256','source_bytes'):assert r.pop(k)==w[k]
label='compiler-progress'
d['firmware'][label]=hashlib.sha256(Path('picocalc-os/port/esp32p4/build-elf/picocalc-os-p4.elf').read_bytes()).hexdigest()
run=dict(firmware=label,**r)
if run not in w['runs']:w['runs'].append(run)
p.write_text(json.dumps(d,indent=2)+'\n')
log=Path('/tmp/nov18-final-agenda.log').read_text()
samples=[s for s in log.splitlines() if 'cji: progress' in s]
phases=[re.search(r'phase=(\w+)',s)[1] for s in samples]
assert set(phases)=={'load','frontend','link','assemble','assembled'}
assert sum(f=='frontend' for f in phases)>=3
print(r); print('samples',len(samples),'frontend',phases.count('frontend'))
print('verified catalog',sum(any(a['result']=='ok' and a['elf_sha256']==w['host_elf_sha256'] for a in w['runs']) for w in d['worlds']))
