"""Revalidate each physical ledger and save the raw UART evidence alongside a paired result."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('guard',type=Path)
parser.add_argument('guard_image',type=Path)
parser.add_argument('experiment',type=Path)
parser.add_argument('images',type=Path)
parser.add_argument('ordinary',type=Path)
parser.add_argument('out',type=Path)
args=parser.parse_args()
perf=next(Path('ttmp/2026/11/18').glob('*CJI-PERF*/scripts'))
def capture(name, source, image):
    rows=list(map(json.loads,(source/'p4-runs.jsonl').read_text().splitlines()))
    summary=json.loads(subprocess.check_output([sys.executable,perf/'09-board-report.py',source]))
    elf=hashlib.sha256((image/'picocalc-os-p4.elf').read_bytes()).hexdigest()
    if elf!=summary['firmware_sha256']: raise ValueError(f'{name}: image identity mismatch')
    dest=args.out/name
    dest.mkdir(parents=True,exist_ok=True)
    for file in ['p4-runs.jsonl','boot.log','flash.log',*(r['raw_log'] for r in rows)]:
        shutil.copyfile(source/file,dest/file)
    return {r['world']:r for r in rows}
out={}
out['guard']=capture('guard',args.guard,args.guard_image)
for name in ('reuse','typed','both'):
    out[name]=capture(name,args.experiment/name,args.images/name)
    for w in ('agenda','files'):
        for k in ('source_sha256','elf_sha256','condition','frontend_reserved_bytes'):
            if out[name][w][k]!=out['guard'][w][k]: raise ValueError(f'{name} {w}: {k}')
restored=capture('restored',args.experiment/'restored',args.ordinary)
if restored['flaky']['elf_sha256']!=out['guard']['flaky']['elf_sha256']: raise ValueError('restoration differs')
table={}
for w in ('agenda','files'):
    table[w]={}
    for name,rows in out.items():
        row=rows[w]
        table[w][name]=dict(elapsed_s=row['elapsed_ms']/1000,frontend_s=row['metrics']['frontend_us']/1e6,
                            gc_s=row['metrics']['gc_us']/1e6,live_peak_bytes=row['metrics']['live_peak_bytes'],
                            collections=row['metrics']['collections'],scratch_bytes=row['scratch_bytes'],
                            elapsed_reduction_percent=100*(1-row['elapsed_ms']/out['guard'][w]['elapsed_ms']))
(args.out/'physical-summary.json').write_text(json.dumps(table,indent=2)+'\n')
