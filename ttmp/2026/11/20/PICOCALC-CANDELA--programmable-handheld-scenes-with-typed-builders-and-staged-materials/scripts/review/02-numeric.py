"""Probe graphics discontinuities with binary32, Q8 and rational arithmetic."""
import json,math,struct
from fractions import Fraction
from pathlib import Path
from collections import Counter

def f32(x):return struct.unpack('<f',struct.pack('<f',float(x)))[0]
def classify(q):return q-math.floor(q)>=Fraction(1,8)
def fixed(x,w):return ((x*w)%256)>=32
def floating(x,w):return classify(f32(f32(x)*f32(w)))
exact=0
for k in range(257):
    for x in range(160):
        assert floating(x,k/256)==fixed(x,k)==classify(Fraction(x*k,256))
        exact+=1
rows=[]
for f in [Fraction(1,10),Fraction(1,12),Fraction(1,7),Fraction(1,3),Fraction(127,1000)]:
    q=round(f*256);counts=Counter();near=Counter();examples=[]
    for x in range(160):
        for y in range(160):
            rational=classify(x*f) and classify(y*f)
            fp=floating(x,f) and floating(y,f)
            fx=fixed(x,q) and fixed(y,q)
            counts['f32VsExact']+=fp!=rational;counts['q8VsExact']+=fx!=rational;counts['f32VsQ8']+=fx!=fp
            fracs=[(v*f)%1 for v in [x,y]]
            distance=min(min(t,1-t,abs(t-Fraction(1,8))) for t in fracs)
            if fx!=fp:
                near['within1over256' if distance<=Fraction(1,256) else 'further']+=1
                if len(examples)<3 and x!=0 and y!=0:examples.append({'xy':[x,y],'f32':fp,'q8':fx,'exact':rational,'distance':str(distance)})
    rows.append({'authored':str(f),'q8':q,'cases':25600,'disagreements':dict(counts),'boundaryBins':dict(near),'witnesses':examples})
# Tiny expressions are also compared when intermediate scale results are requantized.
chains=[]
for weights in [(73,129,153),(252,251,250),(17,79,177)]:
    count=0;witness=[]
    for x in range(160):
        q=256*x;f=f32(x);e=Fraction(x)
        for k in weights:
            q=(q*k)//256;f=f32(f*f32(k/256));e*=Fraction(k,256)
        if ((q%256)>=32)!=classify(f):
            count+=1
            witness.append(dict(x=x,q8=q,fp=f,exact=str(e)))
    chains.append(dict(weights=weights,samples=160,maskDisagreements=count,witnesses=witness[:3]))
colors=[]
for left,right in [(30,220),(70,170),(150,40)]:
    differences=[];float_rounding=0
    for w in range(257):
        exact_color=Fraction(left*(256-w)+right*w,256)
        fp=f32(f32(left*f32(1-w/256))+f32(right*f32(w/256)))
        integer=(left*(256-w)+right*w)//256
        float_rounding+=int(fp)!=integer
        differences.append(float(exact_color-integer))
    assert float_rounding==0
    colors.append(dict(left=left,right=right,samples=257,byteDisagreements=float_rounding,maxTruncation=max(differences)))
print(json.dumps({'dyadic1DSamples':exact,'binary32Operation':'round source and multiply separately','decimal2D':rows,'chainedScales':chains,'mixChannels':colors},indent=2))
