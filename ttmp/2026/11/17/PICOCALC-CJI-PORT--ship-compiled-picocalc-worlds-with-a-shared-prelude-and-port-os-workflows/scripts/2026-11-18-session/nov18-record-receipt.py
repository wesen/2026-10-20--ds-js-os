import hashlib,json,sys
from pathlib import Path
w=sys.argv[1]
p=next(Path('ttmp/2026/11/17').glob('*PORT--*/various/device-catalog-results.json'))
d=json.loads(p.read_bytes()); row=next(x for x in d['worlds'] if x['world']==w)
r=json.loads(Path('/tmp/nov18-'+w+'.jsonl').read_bytes())
src=(Path('picocalc-os/js')/row['file']).read_bytes()
elf=Path('/tmp/p4-catalog-reference',w+'.elf').read_bytes()
assert r['result']=='ok' and r['source_sha256']==hashlib.sha256(src).hexdigest()==row['source_sha256']
assert r['elf_sha256']==row['host_elf_sha256']==hashlib.sha256(elf).hexdigest() and r['elf_bytes']==len(elf)
for k in ('world','file','source_sha256','source_bytes'):
    assert r.pop(k)==row[k]
label='ordinary-reservation'
fw=Path('picocalc-os/port/esp32p4/build-elf/picocalc-os-p4.elf')
d['firmware'][label]=hashlib.sha256(fw.read_bytes()).hexdigest()
run=dict(firmware=label,**r)
if run not in row['runs']:row['runs'].append(run)
p.write_text(json.dumps(d,indent=2)+'\n')
print(w,run)
print(sum(any(a['result']=='ok' and a['elf_sha256']==x['host_elf_sha256'] for a in x['runs']) for x in d['worlds']), 'verified')
