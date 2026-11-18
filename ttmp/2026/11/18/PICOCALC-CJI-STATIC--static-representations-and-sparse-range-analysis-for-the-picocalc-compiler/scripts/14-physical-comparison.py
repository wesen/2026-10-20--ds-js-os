"""Qualify the paired physical benchmark, check independent counters and capture its small receipts."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('run', type=Path)
parser.add_argument('out', type=Path)
args = parser.parse_args()
ticket_root = Path(__file__).resolve().parents[2]
ranges = next(ticket_root.glob('*CJI-RANGES*'))
perf = next(ticket_root.glob('*CJI-PERF*'))
script = perf/'scripts/09-board-report.py'
history = {}
for name, folder in [('control','control'),('files-control','files-control'),('guard','runs/guard'),('restored','restored')]:
    source = args.run/folder
    image = args.run/('guard' if name == 'guard' else 'control')
    elf = hashlib.sha256((image/'picocalc-os-p4.elf').read_bytes()).hexdigest()
    subprocess.run([sys.executable,script,source],check=True,stdout=subprocess.DEVNULL)
    rows = list(map(json.loads,(source/'p4-runs.jsonl').read_text().splitlines()))
    if any(r['firmware_sha256'] != elf or r['requested_heap_mib'] != 8 for r in rows):
        raise ValueError(f'{name} image or heap mismatch')
    history[name] = {r['world']:r for r in rows}
    dest = args.out/name
    dest.mkdir(parents=True,exist_ok=True)
    for file in ['p4-runs.jsonl', *(r['raw_log'] for r in rows)]:
        shutil.copyfile(source/file,dest/file)
    for file in ['flash.log','boot.log']:
        if (source/file).exists():
            (dest/(file + ".gz")).write_bytes(gzip.compress((source/file).read_bytes(), mtime=0))

summary = {}
for w in ('agenda','files'):
    group = 'control' if w == 'agenda' else 'files-control'
    a,b = history[group][w],history['guard'][w]
    if any(a[k] != b[k] for k in ('condition','elf_sha256','source_sha256','frontend_reserved_bytes')):
        raise ValueError('unmatched pair')
    expected = json.loads((ranges/f'various/{w}-guest.json').read_text())['variants']
    for row, variant in [(a,'control'),(b,'guard')]:
        for k in ['collections','live_peak_bytes','survivor_bytes','slide_bytes']:
            if row['metrics'][k] != expected[variant][k]:
                raise ValueError(f'mismatched collector work {w} {variant} {k}')
    summary[w] = dict(control=a,candidate=b,end_to_end_reduction_percent=100*(1-b['elapsed_ms']/a['elapsed_ms']),
                      frontend_reduction_percent=100*(1-b['metrics']['frontend_us']/a['metrics']['frontend_us']))
if history['restored']['flaky']['elf_sha256'] != history['control']['flaky']['elf_sha256']:
    raise ValueError('restoration smoke differs')
(args.out/'pair.json').write_text(json.dumps(summary,indent=2)+'\n')
