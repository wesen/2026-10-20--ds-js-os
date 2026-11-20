"""Extract cursor evidence with app pixels at native resolution."""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
p=argparse.ArgumentParser(description=__doc__)
p.add_argument("captures",type=Path)
p.add_argument("output",type=Path)
a=p.parse_args()
fig=Image.new("RGB",(1024,440),"#f8f7f2")
g=ImageDraw.Draw(fig)
font="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
title=ImageFont.truetype(font,26)
label=ImageFont.truetype(font,18)
g.text((17,12),"Chess framebuffer after launch and two cursor keys",fill="#172b30",font=title)
for i,(stage,description) in enumerate((("e2","Launch  ·  e2"),("e3","Up  ·  e3"),("f3","Right  ·  f3"))):
    x=16+336*i
    im=Image.open(a.captures/(stage+".png")).convert("RGB")
    fig.paste(im,(x,88))
    g.text((x,55),description,font=label,fill="#172b30")
g.text((16,414),"Each capture is 320 × 320. The red square outlines the cursor.",font=ImageFont.truetype(font,15),fill="#304750")
fig.save(a.output)
