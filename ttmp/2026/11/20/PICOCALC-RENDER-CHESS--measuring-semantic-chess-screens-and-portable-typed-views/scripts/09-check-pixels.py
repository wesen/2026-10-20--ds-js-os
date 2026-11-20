"""Gate delivery experiments on independent A/A and A/R raw RGB565 equality."""
import hashlib
import json
import sys
from pathlib import Path

directory = Path(sys.argv[1])
arms = [directory/(name+'-pixels') for name in ('control','control-aa','resident')]
receipts = [json.loads((arm/'receipt.json').read_text()) for arm in arms]
replay = json.loads((directory/'replay.json').read_text())
rows = [r for r in replay['rows'] if r['changed']]
ratio = sum(r['controlPost'] for r in rows) / sum(r['semanticPost'] for r in rows)
assert ratio >= 5
pixels = []
for x,y,z,frame in zip(*receipts,replay['rows'],strict=True):
    assert x['id'] == y['id'] == z['id'] == frame['id']
    raw = [(arm/rec['filename']).read_bytes() for arm,rec in zip(arms,(x,y,z),strict=True)]
    assert len(raw[0]) == 320*320*2 and raw[0] == raw[1] == raw[2], x['id']
    digest = hashlib.sha256(raw[0]).hexdigest()
    assert digest == x['pixelSha256'] == y['pixelSha256'] == z['pixelSha256']
    pixels.append({'id':x['id'], 'sha256':digest, 'changedPixels':x['changedPixels'], 'commands':x['commands']})
skips = [r for r in receipts[2] if r['recoveredSkippedFlush']]
assert len(skips) == 1 and skips[0]['changedPixels'] > 0
result = {'aa':len(pixels),'resident':len(pixels),'orderedOutput':replay['orderedScreensSha256'],'bodyRatioAfterMatchedDedup':ratio,
          'virtualDroppedFlushRecovery':skips[0]['id'],'rows':pixels}
(directory/'pixel-gate.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'{len(pixels)} A/A and {len(pixels)} A/R raw frame pairs match; framed ratio {ratio:.3f}; recovered {skips[0]["id"]}')
