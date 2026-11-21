"""Independent shadow-mask and unlit-material oracles, plus the physical console replay."""
import json
from math import isqrt
from pathlib import Path
import struct
import sys
import zlib

ticket = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(next(ticket.parent.glob('PICOCALC-CANDELA--*')) / 'scripts/review'))
from oracle import Graph, fixture

def expected(scene, weight):
    graph = Graph(fixture(('shared', 'tile')[scene], weight))
    lx, ly = -14, -16  # trunc((31-80)*3/10), trunc((25-80)*3/10)
    norm = lx * lx + ly * ly + 32 * 32
    mask = bytearray()
    colors = bytearray()
    shadow_count = 0
    for y in range(160):
        for x in range(160):
            hits = []
            for index, (cx, cy, cz, r, _) in enumerate(graph.spheres):
                d = r*r - (cx-x)**2 - (cy-y)**2
                if d >= 0:
                    hits.append((cz-isqrt(d), index))
            mat = graph.floor
            shadow = False
            if hits:
                mat = graph.spheres[min(hits)[1]][4]
            else:
                for cx, cy, cz, r, _ in graph.spheres:
                    dx, dy, dz = cx - x, cy - y, 156 - cz
                    dot = dx * lx + dy * ly + 32 * dz
                    if dot > 0 and dot*dot >= (dx*dx + dy*dy + dz*dz - r*r)*norm:
                        shadow = True
                        break
            red, green, blue = graph.rgb(mat,x,y)
            mask.extend(struct.pack('<H',shadow))
            colors.extend(struct.pack('<HH',red*256+green,blue))
            shadow_count += shadow
    return dict(fixture=scene, weight=weight, shadowCRC=f'{zlib.crc32(mask):08x}',
                materialCRC=f'{zlib.crc32(colors):08x}', shadowPixels=shadow_count)

def controls():
    return [expected(scene, weight) for scene, weights in [(0,[0,128,256]),(1,[64,73,128])]
            for weight in weights]

def collect(c, out):
    out = Path(out)
    out.mkdir(parents=True,exist_ok=True)
    oracle = controls()
    rows = []
    for block in range(3):
        for i, case in enumerate(oracle):
            for first in ((block+i)%2,1-(block+i)%2):
                cmd = f"typedmat phases {case['fixture']} {case['weight']} {first}"
                lines = c.command(cmd,timeout=25)
                values = [json.loads(s[len('TRPHASE '):]) for s in lines if s.startswith('TRPHASE ')]
                assert len(values)==1,(cmd,lines[-8:])
                row = values[0]
                assert all(row[k]==v for k,v in case.items()),(case,row)
                assert row['first']==first and min(row['shadowUs'],row['materialUs'])>0
                rows.append(dict(block=block,**row))
                (out/'phases.json').write_text(json.dumps(rows,indent=2)+'\n')
    c.command('typedmat drop')
    return rows

if __name__ == '__main__':
    print(json.dumps(controls(),indent=2))
