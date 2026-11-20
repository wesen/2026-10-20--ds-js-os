"""Compare all generated settled positions in full and retain a compact stable digest of the raw pixels."""
import hashlib
import json
import sys
from pathlib import Path
d=Path(sys.argv[1]); receipt=json.loads((d/'generated-games.json').read_text())
a,b=[json.loads((d/(arm+'-pixels')/'receipt.json').read_text()) for arm in ('control','resident')]
assert len(a)==receipt['settledFrames']
digest=hashlib.sha256()
for x,y in zip(a,b,strict=True):
    assert x['id']==y['id'] and x['pixelSha256']==y['pixelSha256']
    first=(d/'control-pixels'/x['filename']).read_bytes()
    second=(d/'resident-pixels'/y['filename']).read_bytes()
    assert first==second and len(first)==204800
    digest.update(first)
receipt['rawPixelPairs']=len(a);receipt['concatenatedPixelSha256']=digest.hexdigest()
(d/'generated-verified.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('Pixel-identical generated positions',len(a),digest.hexdigest())
