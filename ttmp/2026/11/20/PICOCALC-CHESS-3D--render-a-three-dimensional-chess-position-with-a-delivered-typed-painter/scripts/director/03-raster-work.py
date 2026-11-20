"""Count RGB565 writes that can use complete aligned eight-pixel stores in the original scene."""
import argparse
from collections import Counter
import json
from pathlib import Path
from statistics import median
import struct

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("commands",type=Path)
parser.add_argument("capture_dir",type=Path)
parser.add_argument("output",type=Path)
args=parser.parse_args()
blob=args.commands.read_bytes()
words=list(struct.unpack("<"+"H"*(len(blob)//2),blob))
lengths=[]; blocks=0; filled=0; triangles=0; short=0
at=0
while at<len(words):
    op=words[at]
    at+=1
    if op==4:
        at+=1+words[at]
    elif op==3:
        at+=6+words[at+5]
    elif op in (1,2):
        if op==1: filled+=words[at+2]*words[at+3]
        at+=5
    elif op==5:
        triangles+=1
        coords=[tuple(words[at+i:at+i+2]) for i in (0,2,4)]
        at+=7
        for y in range(min(p[1] for p in coords),max(p[1] for p in coords)):
            hits=[]
            for p,q in zip(coords,coords[1:]+coords[:1]):
                (ax,ay),(bx,by)=sorted((p,q),key=lambda v:v[1])
                if ay<=y<by:
                    dy=by-ay
                    hits.append((2*ax*dy+(2*y+1-2*ay)*(bx-ax)-dy+2*dy-1)//(2*dy))
            if len(hits)==2 and hits[0]!=hits[1]:
                x,right=sorted(hits)
                n=right-x
                lengths.append(n)
                short+=n<8
                # 320-pixel rows preserve payload alignment; assume aligned row zero.
                blocks+=max(0,right-((x+7)//8)*8)//8
    else:
        raise ValueError(op)
assert at==len(words)
changes={}
for pair in (("e2","e3"),("e3","f3")):
    a,b=[(args.capture_dir/(name+".rgb565")).read_bytes() for name in pair]
    assert len(a)==len(b)==320*320*2
    points=[(i%320,i//320) for i,(x,y) in enumerate(zip(struct.iter_unpack("<H",a),struct.iter_unpack("<H",b))) if i//320>=22 and x!=y]
    xs,ys=zip(*points)
    changes[" to ".join(pair)]={"changedPixels":len(points),"box":[min(xs),min(ys),max(xs),max(ys)]}
d={"triangles":triangles,"triangleSpans":len(lengths),"spansUnder8":short,"medianSpan":median(lengths),"trianglePixelsWrittenWithOverdraw":sum(lengths),"triPixelsInAlignedBlocks":blocks*8,"rectanglePixelsFilled":filled,"screenDifferences":changes,"spanLengthHistogram":dict(sorted(Counter(lengths).items())),"assumptions":"16-byte aligned framebuffer, 320 RGB565 pixels per row. Potential eight-pixel stores, not measured speed. Counts before dirty-band comparison."}
args.output.write_text(json.dumps(d,indent=2)+"\n")
print({k:v for k,v in d.items() if k not in ("assumptions","spanLengthHistogram")})
