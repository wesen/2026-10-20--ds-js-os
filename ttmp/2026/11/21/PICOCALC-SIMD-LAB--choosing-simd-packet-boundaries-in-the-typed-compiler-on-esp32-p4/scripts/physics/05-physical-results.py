"""Validate one complete board-output window and compute matched cycle differences."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from statistics import median

PARTICLE=["aos-scalar","aos-pie","soa-scalar","soa-pie","typed-aos","typed-soa","convert-roundtrip","convert-pie-roundtrip","guarded-aos-scalar","guarded-aos-pie","guarded-soa-scalar","guarded-soa-pie"]
CONTACT=["original-scalar","grouped-scalar","grouped-pie","original-typed","grouped-typed","generate-color-scatter","generate-color-pie"]
def summarize(lines):
    rows=[]; seen=set()
    for num,line in enumerate(lines,1):
        m=re.search(r"SIMDPHYS (particle|contact) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)\s*$",line)
        if not m:continue
        kind=m[1]; block,n,arm,repeats,cycles,checksum,ok=map(int,m.groups()[1:])
        assert ok==1 and repeats==12 and cycles>0,(num,line)
        key=(kind,n,arm,block); assert key not in seen,key;seen.add(key)
        rows.append({"kind":kind,"n":n,"arm":arm,"name":(PARTICLE if kind=="particle" else CONTACT)[arm],"block":block,"repeats":repeats,"cycles":cycles,"checksum":checksum})
    expect={("particle",n,i,b) for n in (7,8,64,127,128) for i in range(12) for b in range(12)}
    expect.update(("contact",128,i,b) for i in range(7) for b in range(14))
    assert seen==expect,(len(seen),list(expect-seen)[:5],list(seen-expect)[:5])
    def cycles(kind,n,k):
        rs=sorted([r for r in rows if (r["kind"],r["n"],r["arm"])==(kind,n,k)],key=lambda r:r["block"])
        assert len({r["checksum"] for r in rs})==1
        return [r["cycles"]/r["repeats"] for r in rs]
    comp=[]
    for kind,ns,pairs in [("particle",(7,8,64,127,128),[(0,1),(2,3),(8,9),(10,11),(0,2),(1,3),(0,7),(1,7),(4,9),(5,11)]),("contact",(128,),[(0,1),(1,2),(0,6),(3,4)])]:
      for n in ns:
        for i,j in pairs:
            a=cycles(kind,n,i);b=cycles(kind,n,j); d=[x-y for x,y in zip(a,b,strict=True)];pct=[100*(x-y)/x for x,y in zip(a,b,strict=True)]
            names=PARTICLE if kind=="particle" else CONTACT
            comp.append({"kind":kind,"n":n,"baseline":names[i],"candidate":names[j],"pairs":len(a),"medianSavedCycles":median(d),"medianSavedPct":median(pct),"favorableBlocks":sum(x>0 for x in d)})
    means=[{"kind":kind,"n":n,"arm":name,"medianCyclesPerCall":median(cycles(kind,n,i))}
        for kind,ns,arms in [("particle",(7,8,64,127,128),PARTICLE),("contact",(128,),CONTACT)] for n in ns for i,name in enumerate(arms)]
    return {"rows":rows,"unit":"P4 cycle-counter delta per call across a 12-call batch; setup and validation excluded","arms":means,"comparisons":comp}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("capture",type=Path);ap.add_argument("output",type=Path)
    args=ap.parse_args()
    clean=re.sub(r"\x1b\[[0-9;]*m","",args.capture.read_bytes().decode(errors="replace"))
    windows=re.findall(r"SIMDPHYS begin(.*?)SIMDPHYS done",clean,re.S)
    assert len(windows)==1,("expected one complete physical run",len(windows))
    result=summarize(windows[0].splitlines())
    result["captureSHA"]=hashlib.sha256(args.capture.read_bytes()).hexdigest()
    batch=re.search(r"SIMDPHYS batches((?: \d+)+)",windows[0]);result["batchSizes"]=[int(x) for x in batch[1].split()]
    args.output.write_text(json.dumps(result,separators=(",",":"))+"\n")
    print(len(result["rows"]),"correct rows;",len(result["comparisons"]),"matched comparisons")
if __name__=="__main__":main()
