"""Compare the staged triangle raster with an independent pixel-center oracle, then render the scene."""
import argparse
import json
from hashlib import sha256
from pathlib import Path
import struct
import subprocess
from PIL import Image, ImageDraw

from oracle import covered, hint_strip, raster as reference_frame, small_font

here = Path(__file__).resolve().parent
root = here.parents[6]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("poses", type=Path)
parser.add_argument("work", type=Path)
parser.add_argument("evidence", type=Path)
a=parser.parse_args()
a.work.mkdir(parents=True,exist_ok=True)
a.evidence.mkdir(parents=True,exist_ok=True)
subprocess.run(["python3",here/"stage.py",a.work],check=True)
nucleus=root/"picocalc-os/nucleus"
mobile=next(here.parents[2].glob("PICOCALC-MOBILE-PAINTER--*"))
raster=a.work/"raster"
font=small_font(nucleus/"font_data.h")
subprocess.run(["cc","-std=gnu11","-O2","-Wall","-Wextra","-ffunction-sections","-fdata-sections","-I",a.work/"picocalc-os/nucleus","-I",nucleus,mobile/"scripts/director/01-raster.c",a.work/"picocalc-os/nucleus/painter_commands.c",nucleus/"gfx.c",nucleus/"util.c","-Wl,--gc-sections","-o",raster],check=True)
def image_data(payload):
    return subprocess.check_output([raster],input=payload)
def command(words):
    return struct.pack("<"+"H"*len(words),*words)
# Test triangles in both winding orders, including shared diagonal and degenerate forms.
# Intersect three half-planes at each pixel center using directed edge functions.
shapes=[[(0,0),(16,0),(0,16)],[(16,0),(16,16),(0,16)],[(2,1),(33,7),(5,44)],[(0,1),(0,5),(0,9)],[(319,279),(292,254),(319,250)]]
for verts in shapes:
    for points in (verts,list(reversed(verts))):
        buf=image_data(command([5,*[v for point in points for v in point],0x1234,4,0]))[:204800]
        actual={(i%320,i//320-22) for i,(c,) in enumerate(struct.iter_unpack("<H",buf)) if c==0x1234}
        assert actual==set(covered(tuple(points))), (points,actual.symmetric_difference(covered(tuple(points))))
for words in ([5,0,0,320,1,0,1,1,4,0],[5,0,0,0,280,0,1,1,4,0],[5,1,2,3,4,5],[5,1,2,3,4,5,6,7]):
    assert subprocess.run([raster],input=command(words),capture_output=True).returncode==2
data=json.loads((a.poses/"receipt.json").read_text())
for row in data["cases"]:
    key=row["name"]
    commands=(a.poses/(key+".words")).read_bytes()
    frame=image_data(commands)
    expected_body,hints=reference_frame(commands,font)
    expected_strip=hint_strip(hints,font)
    body=frame[22*640:302*640]
    assert frame[204800:]==row["hints"].encode("ascii")
    assert not any(frame[:22*640]+frame[302*640:204800])
    assert body==expected_body, key
    row["bodySha256"]=sha256(expected_body).hexdigest()
    row["hintSha256"]=sha256(expected_strip).hexdigest()
    row["appSha256"]=sha256(expected_body+expected_strip).hexdigest()
    if key in ["e2","e3","f3","low","high"]:
        (a.work/(key+".rgb565")).write_bytes(expected_body+expected_strip)
        rgb=bytearray()
        for color, in struct.iter_unpack("<H",body):
            r,g,b=color>>11,(color>>5)&63,color&31
            rgb.extend(((r<<3)|(r>>2),(g<<2)|(g>>4),(b<<3)|(b>>2)))
        Image.frombytes("RGB",(320,280),bytes(rgb)).save(a.work/(key+".png"))
assert len({r["bodySha256"] for r in data["cases"][:5]})==5
result=Image.new("RGB",(984,318),"#f5f2e9")
draw=ImageDraw.Draw(result)
for i,(key,label) in enumerate([("low","Low camera"),("e2","Opening camera"),("high","High camera")]):
    result.paste(Image.open(a.work/(key+".png")),(8+326*i,7))
    draw.text((15+326*i,294),label,fill="#203132")
result.save(a.evidence/"camera-poses.png")
data.update(independentTriangleCases=len(shapes)*2,malformedLists=4)
(a.evidence/"host-poses.json").write_text(json.dumps(data,indent=2)+"\n")
print(len(data["cases"]),"scene states and camera controls;",len(shapes)*2,"independent triangles")
