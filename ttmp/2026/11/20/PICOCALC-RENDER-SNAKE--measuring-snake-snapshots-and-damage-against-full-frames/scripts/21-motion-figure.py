"""Render a publication figure directly from recorded little-endian RGB565 panels."""
from array import array
import csv
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out=Path(sys.argv[1])
rows=list(csv.DictReader((out/'damage-0.csv').open()))
font_dir=Path('/usr/share/fonts/truetype/dejavu')
def font(n,bold=False):
    return ImageFont.truetype(str(font_dir/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')),n)
def raw(index):
    a=array('H',(out/f'control-pixels/{index:05}.rgb565').read_bytes())
    if sys.byteorder!='little': a.byteswap()
    return a
def panel(a):
    im=Image.new('RGB',(320,320))
    im.putdata([((v>>11)*255//31,((v>>5)&63)*255//63,(v&31)*255//31) for v in a])
    return im
canvas=Image.new('RGB',(960,486),'white');d=ImageDraw.Draw(canvas)
text='#1d1c1a';muted='#585650';changed='#493b9f';over='#82ccbd'
d.text((20,16),'Which pixels change when a Snake moves?',font=font(27,True),fill=text)
d.text((21,58),'The same board crop before and after a tick, magnified three times.',font=font(18),fill=muted)
cols=[20,335,650]
for x,label in zip(cols,['Before','After','Transfer rectangle']):
    d.text((x,100),label,font=font(17,True),fill=text)
for num,(id,heading) in enumerate([('move-down','Ordinary turn'),('enter-vacated-tail','Legal entry into the vacated tail')]):
    index=next(i for i,r in enumerate(rows) if r['id']==id)
    ref=rows[index]
    a,b=raw(index-1),raw(index)
    different=[(i%320,i//320) for i,(v,w) in enumerate(zip(a,b)) if v!=w]
    l=min(x for x,y in different);r=max(x for x,y in different)
    t=min(y for x,y in different);bt=max(y for x,y in different)
    assert int(ref['rects'])==1 and (r-l+1)*(bt-t+1)==int(ref['transferPixels'])
    assert len(different)==int(ref['changed'])
    mask=Image.new('RGB',(320,320),'#f5f4f0');md=ImageDraw.Draw(mask)
    md.rectangle((l,t,r,bt),fill=over)
    for q in different: md.point(q,fill=changed)
    y=135+num*150
    d.text((20,y),heading,font=font(17,True),fill=text)
    d.text((425,y),f'{len(different):,} changed pixels, {int(ref["transferPixels"]):,} pixels in one rectangle',
           font=font(16),fill=muted)
    clip=(43,154,134,187)
    for x,image in zip(cols,[panel(a),panel(b),mask]):
        view=image.crop(clip).resize((273,99),Image.Resampling.NEAREST)
        canvas.paste(view,(x,y+29));d.rectangle((x-1,y+28,x+273,y+128),outline='#c5c4bd')
for x,col,label in [(21,changed,'Pixel whose RGB565 value changed'),(475,over,'Unchanged pixel inside the rectangle')]:
    d.rectangle((x,448,x+20,468),fill=col)
    d.text((x+30,447),label,font=font(16),fill=text)
canvas.save(sys.argv[2],optimize=True)
