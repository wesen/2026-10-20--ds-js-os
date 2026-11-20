"""Freeze 51 previously qualified command streams, and generate host oracle or board data."""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import struct
import sys

here=Path(__file__).resolve().parent
day=here.parents[2]
scene=next(day.glob('PICOCALC-CHESS-3D--*'))
root=here.parents[6]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--freeze',type=Path,help='previously qualified directory of .words files')
parser.add_argument('--oracle',type=Path,help='write packed 320x280 body rasters for host differential')
parser.add_argument('--board',type=Path,help='write board-cases.inc for the benchmark')
args=parser.parse_args()
cases=json.loads((scene/'various/host-poses.json').read_text())['cases']
blob=here/'corpus.bin'
if args.freeze:
    packed=bytearray()
    for case in cases:
        data=(args.freeze/(case['name']+'.words')).read_bytes()
        assert hashlib.sha256(data).hexdigest()==case['commandSha256']
        packed.extend(struct.pack('<H',len(data)//2)+data)
    blob.write_bytes(packed)
data=blob.read_bytes()
rows={}
at=0
for case in cases:
    key=case['name']
    size=struct.unpack_from('<H',data,at)[0]*2
    raw=data[at+2:at+2+size]
    assert hashlib.sha256(raw).hexdigest()==case['commandSha256']
    rows[key]=raw
    at+=2+size
assert at==len(data)
if args.oracle or args.board:
    sys.path.insert(0,str(scene/'scripts/scene'))
    from oracle import raster,small_font,hint_strip
    font=small_font(root/'picocalc-os/nucleus/font_data.h')
    bodies={}
    for case in cases:
        name=case['name']
        body,hints=raster(rows[name],font)
        assert hashlib.sha256(body+hint_strip(hints,font)).hexdigest()==case['appSha256']
        bodies[name]=body
if args.oracle:
    args.oracle.write_bytes(b''.join(bodies.values()))
if args.board:
    pairs=[('cursor-up','e2','e3'),('cursor-right','e3','f3'),
           ('unchanged','e2','pos-1'),('move-e4','pos-9','pos-10'),('engine-knight','pos-11','pos-12'),
           ('promotion','pos-24','pos-25'),('castle-short','pos-34','pos-35'),
           ('castle-long','pos-39','pos-40'),('en-passant','pos-44','pos-45'),('camera','e2','low')]
    def fnv(d):
        h=2166136261
        for b in d: h=((h^b)*16777619)&0xffffffff
        return h
    with args.board.open('w') as out:
        for name in dict.fromkeys(item for _,a,b in pairs for item in (a,b)):
            words=struct.unpack('<'+'H'*(len(rows[name])//2),rows[name])
            print('static const uint16_t w_'+name.replace('-','_')+'[] = {',file=out)
            for start in range(0,len(words),24): print(','.join(map(str,words[start:start+24]))+',',file=out)
            print('};',file=out)
        print('static const struct board_case board_cases[] = {',file=out)
        for title,a,b in pairs:
            print('{"%s",w_%s,%d,w_%s,%d,UINT32_C(0x%08x)},'%(title,a.replace('-','_'),len(rows[a])//2,
                  b.replace('-','_'),len(rows[b])//2,fnv(bodies[b])),file=out)
        print('};',file=out)
