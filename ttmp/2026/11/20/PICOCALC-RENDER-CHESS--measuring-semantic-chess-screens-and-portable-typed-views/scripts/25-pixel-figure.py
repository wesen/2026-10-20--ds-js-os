"""Make an article figure from the two verified full reference screens and their exact binary difference."""
from pathlib import Path
import array
import json
import sys
from PIL import Image,ImageDraw,ImageFont
d=Path(sys.argv[1]);dest=Path(sys.argv[2])
receipts=json.loads((d/'control-pixels/receipt.json').read_text())
ids=['opening/006 esc','opening/007 enter']
def read(label):
    row=next(x for x in receipts if x['id']==label)
    data=array.array('H');data.frombytes((d/'control-pixels'/row['filename']).read_bytes())
    if sys.byteorder!='little':data.byteswap()
    return data
def rgb(p):
    r,g,b=p>>11,(p>>5)&63,p&31
    return (r*255//31,g*255//63,b*255//31)
def picture(colors):
    im=Image.new('RGB',(320,320));im.putdata(colors);return im
a,b=map(read,ids); count=sum(x!=y for x,y in zip(a,b,strict=True))
assert count==274
panels=[picture([rgb(x) for x in a]),picture([rgb(x) for x in b]),picture([(176,56,21) if x!=y else (241,240,236) for x,y in zip(a,b,strict=True)])]
canvas=Image.new('RGB',(1024,389),'white');draw=ImageDraw.Draw(canvas)
font=ImageFont.truetype('DejaVuSans.ttf',16)
for i,(panel,title) in enumerate(zip(panels,('Before selection','After selecting e2','274 changed pixels'),strict=True)):
    x=16+i*336
    draw.text((x,10),title,font=font,fill='#20252b')
    canvas.paste(panel,(x,42))
canvas.save(dest,optimize=True)
