#!/usr/bin/env python3
"""Compare original ordinals, change-row coverage and physical archive exposure in two frozen services."""
import argparse,json
from pathlib import Path
from urllib.request import Request,urlopen

def snapshot(port):
    base=f"http://127.0.0.1:{port}/sessions"
    def req(url, method, code=None):
        data=json.dumps({"source":code}).encode() if code is not None else None
        with urlopen(Request(url,method=method,data=data,headers={"Content-Type":"application/json"}),timeout=25) as r:
            out=r.read()
        return json.loads(out) if out else None
    session=base+'/'+req(base,'POST')['id']
    try:
        def ev(code):
            r=req(session+'/eval','POST',code)
            if not r['ok']:raise ValueError(r)
            return r['value']
        ev('var tr = a.variant("checked").function("row").timeline("middle"); var metric = q.ir.instructions().opcode("load").resultType("i32").pointer(a.variant("checked").function("row").argument(0)).count(); 1')
        rows=ev('q.run(tr.measure(metric).changes().table("ordinal","status"), {maxRows:5000}).rows')
        fields=ev('q.run(a.variant("checked").events("middle").select("ordinal","header","scope"), {maxRows:5000}).rows')
        return {"rows":{r["ordinal"]:r["status"] for r in rows},"fields":{r['ordinal']:r for r in fields},
                "hardwareType":ev("typeof hardware"),"hardwareMentionedInRootHelp":ev("q.help().includes('hardware')"),
                 "validPlanOptions":ev('q.run(a.events().select("ordinal"), {bindings:{}, maxRows:1}).rows.length'),
                "descriptionFields":ev('Object.keys(profiles.arm("checked-llc").describe()).sort()'),
                "primaryMedianPct":ev("""['scalar','pie'].map(c => {
                    const x=hardware.pairs('stock',c,'primary').map(r=>r.savedPct).sort((a,b)=>a-b);
                    return {candidate:c,n:x.length,lower:x[35],upper:x[36],median:(x[35]+x[36])/2};
                })"""),
                "defaultPairCount":ev("hardware.pairs('stock','pie','clean').filter(r=>r.pose==='default').length")}
    finally:req(session,'DELETE')

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("out",type=Path);p.add_argument("--baseline",type=int,default=3791);p.add_argument("--candidate",type=int,default=3792);args=p.parse_args()
    b,c=map(snapshot,[args.baseline,args.candidate]); added=set(c['rows'])-set(b['rows']); removed=set(b['rows'])-set(c['rows'])
    def summary(s):return {k:v for k,v in s.items() if k not in ('rows','fields')}|{'rowCount':len(s['rows'])}
    out={"baseline":summary(b),"candidate":summary(c),"removed":sorted(removed),"added":sorted(added),
        "addedOutsideLoopSubject":[{"ordinal":i,"header":c['fields'][i]['header'],"kind":c['fields'][i]['scope']['kind'],"changeStatus":c['rows'][i]} for i in sorted(added) if c['fields'][i]['scope']['kind']!="loop"]}
    args.out.write_text(json.dumps(out,indent=2)+"\n"); print(json.dumps(out))
if __name__=="__main__":main()
