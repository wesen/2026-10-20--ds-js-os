"""Load verified board rows into one private JS session, then compare physical and guest counts.

Use --keep to print the id for further trace-repl eval calls. A later close command releases it.
"""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

T=Path(__file__).resolve().parents[2]
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--addr",default="127.0.0.1:3794");ap.add_argument("--keep",action="store_true")
    ap.add_argument("--out",type=Path);a=ap.parse_args()
    if a.addr.split(":")[0] not in ("127.0.0.1","localhost"):raise ValueError("a loopback service is required")
    def req(method,url,data=None):
        request=urllib.request.Request(url,method=method,data=None if data is None else json.dumps(data).encode(),headers={"Content-Type":"application/json"})
        with urllib.request.urlopen(request,timeout=20) as resp:
            raw=resp.read();return json.loads(raw) if raw else None
    root="http://"+a.addr+"/sessions";sid=req("POST",root)["id"];url=root+"/"+sid
    def evaluate(js):
        r=req("POST",url+"/eval",{"source":js})
        if not r.get("ok"):raise ValueError(r)
        return r.get("value")
    try:
        j=json.loads((T/"various/physics/board-results.json").read_text())
        source=(T/"various/physics/physical.log").read_bytes()
        if hashlib.sha256(source).hexdigest()!=j["captureSHA"]:raise ValueError("raw UART hash mismatch")
        evaluate("const physics = [];")
        rows=j["rows"]
        for i in range(0,len(rows),80):
            evaluate("physics.push(..."+json.dumps(rows[i:i+80],separators=(",",":"))+")")
        evaluate("""const pm = xs => { const a=xs.slice().sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2 };
const pairedPhysics = (kind,n,baseline,candidate) => {
  const find = name => physics.filter(r=>r.kind===kind && r.n===n && r.name===name).sort((a,b)=>a.block-b.block);
  const a=find(baseline), b=find(candidate);
  if(!a.length || a.length!==b.length || a.some((v,i)=>v.block!==b[i].block||v.repeats!==b[i].repeats) || new Set(a.map(v=>v.block)).size!==a.length)throw Error("incomplete matched blocks");
  const pct=a.map((v,i)=>100*(v.cycles-b[i].cycles)/v.cycles);
  return {blocks:a.length,medianSavedPct:pm(pct),winningBlocks:pct.filter(x=>x>0).length,unit:"physical P4 cycles, percent of matched baseline"};
};undefined""")
        cells={"checkedPlanar":'pairedPhysics("particle",128,"guarded-soa-scalar","guarded-soa-pie")',
        "conversion":'pairedPhysics("particle",128,"aos-scalar","convert-pie-roundtrip")',
        "contact":'pairedPhysics("contact",128,"grouped-scalar","grouped-pie")',
        "packedArithmetic":"""simd.executions("physics-guarded_soa_pie","physics-guarded_soa_pie-particle-n128","packed-arithmetic")"""}
        result={k:{"source":v,"result":evaluate(v)} for k,v in cells.items()}
        doc={"physicalCaptureSHA":j["captureSHA"],"rows":len(rows),"cells":result}
        if a.out:a.out.write_text(json.dumps(doc,indent=2)+"\n")
        print(json.dumps(doc,indent=2))
        if a.keep:print("Retained session:",sid)
    finally:
        if not a.keep:req("DELETE",url)
if __name__=="__main__":main()
