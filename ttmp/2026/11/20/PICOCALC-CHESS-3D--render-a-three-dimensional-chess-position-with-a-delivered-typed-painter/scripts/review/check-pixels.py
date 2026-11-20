"""Rasterize only the words returned by the native packed painter and compare frozen hashes."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

here=Path(__file__).resolve().parent
ticket=here.parent.parent
sys.path.insert(0,str(here.parent/'scene'))
from oracle import hint_strip, raster, small_font

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('native_words',type=Path)
args=parser.parse_args()
font=small_font(here.parents[6]/'picocalc-os/nucleus/font_data.h')
reference=json.loads((ticket/'various/host-poses.json').read_text())
matched=[]
for r in reference['cases']:
    name=r['name']
    label='game-0' if name=='e2' else name.replace('pos-','game-')
    words=(args.native_words/(label+'.words')).read_bytes()
    body,hints=raster(words,font)
    app=body+hint_strip(hints,font)
    word_hash=hashlib.sha256(words).hexdigest()
    app_hash=hashlib.sha256(app).hexdigest()
    assert word_hash==r['commandSha256'],label
    assert app_hash==r['appSha256'],label
    assert len(app)==320*298*2
    matched.append(app_hash)
print(json.dumps({'frames':len(matched),'uniqueFrames':len(set(matched)),'pixelsPerFrame':320*298,
                  'orderedHashesSha256':hashlib.sha256(''.join(matched).encode()).hexdigest()},indent=2))
