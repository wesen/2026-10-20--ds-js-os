"""Show the actual host-rendered game and hints, with a labeled host header."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def preview(ref):
    values = memoryview(ref).cast("H")
    rgb = bytearray()
    for pixel in values:
        rgb.extend(((pixel >> 11)*255//31, ((pixel>>5)&63)*255//63, (pixel&31)*255//31))
    view = Image.new("RGB",(320,320),"#292d32")
    ImageDraw.Draw(view).text((9,3),"Chess   /   host render",fill="#fcf7df",font=ImageFont.load_default(size=13))
    view.paste(Image.frombytes("RGB",(320,298),bytes(rgb)),(0,22))
    return view


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("match",type=Path)
    p.add_argument("output",type=Path)
    a = p.parse_args()
    a.output.mkdir(parents=True,exist_ok=True)
    rows = json.loads((a.match/"match.json").read_text())
    rows.extend({"label":f"phase-{i:02}"} for i in range(32))
    for row in rows:
        raw = (a.match/(row["label"]+".ref")).read_bytes()
        preview(raw).save(a.output/(row["label"]+".png"))
