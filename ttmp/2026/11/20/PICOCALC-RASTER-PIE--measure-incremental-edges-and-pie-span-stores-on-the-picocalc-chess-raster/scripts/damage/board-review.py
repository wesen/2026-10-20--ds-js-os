"""Verify complete damage runs in the operator's captured output and summarize paired cycles."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from statistics import median
import subprocess
import tempfile

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('capture', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
host = json.loads((here / 'host.json').read_text())
cases = [c for c in host['examples'] if c['name'] != 'hint-only']
scene = next(here.parents[2].glob('PICOCALC-CHESS-3D--*'))
frames = json.loads((scene / 'various/host-poses.json').read_text())['cases']
indices = {c['name']: i for i, c in enumerate(frames)}
with tempfile.TemporaryDirectory(prefix='raster-board-check-') as tmp:
    oracle = Path(tmp) / 'oracle'
    subprocess.run(['python3', '-B', here / 'prepare.py', '--oracle', oracle], check=True)
    data = oracle.read_bytes()
hashes = {}
for c in cases:
    i = indices[c['new']]
    size = 320 * 280 * 2
    h = 2166136261
    for byte in data[i*size:(i+1)*size]:
        h = ((h ^ byte) * 16777619) & 0xffffffff
    hashes[c['name']] = '%08x' % h

log = args.capture.read_text(errors='replace').replace('\r','')
blocks = re.findall(r'DAMAGE_BEGIN pairs=10 samples=7 core=(\d+)\n(.*?)DAMAGE_DONE (\w+)', log, re.S)
assert blocks, 'no complete operator capture'
runs = []
for core, records, status in blocks:
    assert status == 'ok'
    results = []
    for c in cases:
        name = re.escape(c['name'])
        found = re.findall(rf'DAMAGE_CASE {name} mode=(\d+) box=([0-9,]+) replay=(\d+) fnv=(\w+) (\w+)', records)
        assert len(found) == 1, (c, found)
        mode, box, replay, digest, ok = found[0]
        assert ['none','partial','full'][int(mode)] == c['mode'] and list(map(int,box.split(','))) == c['box']
        assert int(replay) == (c['replayed'] or 0) and digest == hashes[c['name']] and ok == 'ok'
        arms = {}
        for arm in ('full', 'damage'):
            times = re.findall(rf'DAMAGE_CYCLES {name} {arm}((?: [0-9]+)+)', records)
            assert len(times) == 1
            arms[arm] = list(map(int,times[0].split()))
            assert len(arms[arm]) == 7 and min(arms[arm]) > 0
        pairs = list(zip(arms['full'],arms['damage']))
        results.append({'name':c['name'], 'mode':c['mode'], 'fnv':digest, **arms,
                        'fullMedian':median(arms['full']), 'damageMedian':median(arms['damage']),
                        'medianPairedSaving':median(f-d for f,d in pairs),
                        'medianPairedRatio':round(median(d/f for f,d in pairs),6),
                        'wins':sum(d<f for f,d in pairs)})
    assert len(re.findall(r'DAMAGE_CASE ', records)) == len(cases)
    runs.append({'core':int(core), 'cases':results})
report = {'schema':1,'frequencyMHz':360,'completeRuns':len(runs),'samplesPerPair':7,
          'captureRowsSha256':hashlib.sha256(('\n'.join(line.strip() for line in log.splitlines()
                     if line.startswith('DAMAGE_'))+'\n').encode()).hexdigest(),'runs':runs}
args.output.write_text(json.dumps(report,indent=2)+'\n')
for i,run in enumerate(runs):
    for c in run['cases']:
        print(i+1,c['name'],c['fullMedian'],c['damageMedian'],c['medianPairedSaving'],c['medianPairedRatio'],c['wins'])
