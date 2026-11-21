"""Pair the frozen and filtered compilers, requiring identical trial outputs."""
import json
import sys
from pathlib import Path
from statistics import median

root = Path(sys.argv[1])
loads = json.loads((root / 'loads.json').read_text())
rows = json.loads((root / 'rows.json').read_text())
images = {r['id']:r for r in json.loads((root / 'images.json').read_text())}
assert images[5]['elf'] == images[8]['elf'] and images[5]['image'] == images[8]['image']
assert len(rows) == len(loads) == 18 and len({tuple(r['crc']) for r in rows}) == 1
names = {0:'stock', 8:'unfilteredPie', 5:'filteredPie'}
data = {(r['block'], r['program']):r for r in loads}
assert len(data) == 18
result = {'cold':{}, 'pairedCompilerUs':{}}
for arm,name in names.items():
    selected = [data[b,arm] for b in range(6)]
    assert sorted(r['position'] for r in selected) == [0,0,1,1,2,2]
    assert all(r['elfCRC'] == images[arm]['crc'] for r in selected)
    result['cold'][name] = {k:median(r[k] for r in selected) for k in ('compilerUs','peakJSBytes','segmentBytes')}
for a,b,label in [(8,5,'savedByFilter'), (5,0,'filteredOverStock')]:
    values = [data[i,a]['compilerUs'] - data[i,b]['compilerUs'] for i in range(6)]
    result['pairedCompilerUs'][label] = {'median':median(values),'min':min(values),'max':max(values)}
print(json.dumps(result, indent=2))
