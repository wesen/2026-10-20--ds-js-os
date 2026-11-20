"""Independent pixel-center reference for the Chess body and system hint strip."""
import argparse
from array import array
from pathlib import Path
import json
import struct
import sys
import zlib

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "scene"))
from oracle import covered, draw_small, hint_strip, little_endian, small_font


def raster(stream, font):
    data = [word for word, in struct.iter_unpack("<H", stream)]
    pixels = array("H", [0]) * (320 * 280)
    at = 0
    while at < len(data):
        op = data[at]
        at += 1
        if op == 1 or op == 2:
            x, y, w, h, color = data[at:at + 5]
            at += 5
            assert 0 < w <= 320-x and 0 < h <= 280-y
            for row in range(y,y+h):
                a = row*320+x
                if op == 1 or row in (y,y+h-1):
                    pixels[a:a+w] = array("H",[color])*w
                else:
                    pixels[a] = pixels[a+w-1] = color
        elif op == 5:
            ax, ay, bx, by, cx, cy, color = data[at:at+7]
            at += 7
            assert max(ax,bx,cx) < 320 and max(ay,by,cy) < 280
            for x,y in covered(((ax,ay),(bx,by),(cx,cy))):
                pixels[y*320+x] = color
        elif op == 3:
            x, y, face, color, max_width, n = data[at:at+6]
            assert face == 0 and y+12 <= 280
            text = "".join(map(chr,data[at+6:at+6+n]))
            draw_small(pixels,font,x,y,text,color,max_width or 320-x)
            at += 6+n
        elif op == 4:
            n = data[at]
            assert at+1+n == len(data)
            hints = "".join(map(chr,data[at+1:]))
            return little_endian(pixels)+hint_strip(hints,font)
        else:
            raise ValueError(f"unknown op {op}")
    raise ValueError("missing HINTS")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("match", type=Path)
    args = ap.parse_args()
    font = small_font(here.parents[6]/"picocalc-os/nucleus/font_data.h")
    cases = json.loads((args.match/"match.json").read_text())
    cases.extend({"label":f"phase-{phase:02}"} for phase in range(32))
    for case in cases:
        label = case["label"]
        image = raster((args.match/(label+".words")).read_bytes(),font)
        assert len(image) == 320*298*2
        (args.match/(label+".ref")).write_bytes(image)
        print(label, f"{zlib.crc32(image):08x}")


if __name__ == "__main__":
    main()
