"""Compare cold, recording and verified warm Node runs of the guarded source frontend."""
from pathlib import Path
from statistics import median
from time import perf_counter_ns
import argparse
import hashlib
import json
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('compiler', type=Path)
parser.add_argument('reference_directory', type=Path)
parser.add_argument('scratch', type=Path)
args = parser.parse_args()
args.scratch.mkdir(parents=True, exist_ok=True)
report = {}
for w in ('files', 'agenda'):
    sidecar = args.scratch / (w + '.sidecar')
    reference = (args.reference_directory / (w + '.ref')).read_bytes()
    options = dict(cold=[], record=['--emit-sidecar', str(sidecar)],
                   replay=['--sidecar', str(sidecar), '--sidecar-strict', '--sidecar-log'])
    # Prime the file before measuring. Rotate the three treatments over three rounds.
    rows = []
    for i, order in enumerate([['record'], ['cold','record','replay'], ['record','replay','cold'], ['replay','cold','record']]):
        for mode in order:
            t = perf_counter_ns()
            proc = subprocess.run(['node', args.compiler/'cji.js', f'picocalc-os/js/apps/{w}.js','--world-unit','--emit',*options[mode]],capture_output=True)
            sec = (perf_counter_ns()-t)/1e9
            msg = proc.stderr.decode().strip()
            if proc.returncode or proc.stdout != reference:
                raise RuntimeError((w,mode,proc.returncode,msg))
            if mode == 'replay':
                if not msg.startswith('CJI-SIDECAR ') or set(msg.removeprefix('CJI-SIDECAR ').split('; ')) != {'ok'}:
                    raise ValueError(msg)
            if i: rows.append(dict(mode=mode,elapsed_s=sec,log=msg))
    report[w] = dict(rows=rows, median_s={mode:median(r['elapsed_s'] for r in rows if r['mode']==mode) for mode in options},
                     sidecar_bytes=sidecar.stat().st_size, slir_sha256=hashlib.sha256(reference).hexdigest())
print(json.dumps(report, indent=2))
