#!/usr/bin/env python3
"""Reconcile the repaired classifier with the actual print marker at every returned ordinal."""
from pathlib import Path
import argparse,gzip,hashlib,json
from urllib.request import Request,urlopen

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("out",type=Path)
    p.add_argument("--port",type=int,default=3792)
    opt=p.parse_args()
    b=f"http://127.0.0.1:{opt.port}/sessions"
    def http(url,method,code=None):
        d=None if code is None else json.dumps({"source":code}).encode()
        req=Request(url,method=method,data=d,headers={"Content-Type":"application/json"})
        with urlopen(req,timeout=20) as r:data=r.read()
        return json.loads(data) if data else None
    root=Path(__file__).resolve().parents[2]/"PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/various/llvm-pipeline"
    manifest=json.loads((root/"manifest.json").read_text())
    session=b+"/"+http(b,"POST")["id"]
    report={}
    try:
        for v in ("checked","unchecked","firmware"):
            query=f'q.run(a.variant("{v}").events("middle").where(e=>e.scope.kind==="loop").select("ordinal"), {{maxRows:5000}}).rows.map(r=>r.ordinal)'
            reply=http(session+"/eval","POST",query)
            if not reply["ok"]:raise ValueError(reply)
            found=set(reply["value"])
            counted=http(session+"/eval","POST",f'q.run(a.variant("{v}").events("middle").where(e=>e.scope.kind==="loop").count()).value')
            if not counted["ok"] or len(found)!=counted["value"]:
                raise ValueError("row materialization truncated loop ordinal list")
            raw=gzip.decompress((root/f"{v}-middle.log.gz").read_bytes())
            assert hashlib.sha256(raw).hexdigest()==manifest[v]["middle"]["sha256"]
            idx=json.loads(gzip.decompress((root/f"{v}-middle.index.json.gz").read_bytes()))
            explicit=set()
            others=[]
            for i,rec in enumerate(idx):
                start=rec["offset"];end=idx[i+1]["offset"] if i+1<len(idx) else len(raw)
                body=raw[start:end].decode().splitlines()
                first=next((ln for ln in body[1:] if ln.strip()),"")
                if first=="; Preheader:":
                    explicit.add(i)
                elif i in found:
                    others.append({"ordinal":i,"header":rec["header"],"start":start,"end":end,
                                   "firstBodyLine":first,"firstSixBodyLines":body[1:7]})
            report[v]={"count":len(found),"missingExplicitPreheaderOrdinals":sorted(explicit-found),
                       "additional":others,"streamSHA":manifest[v]["middle"]["sha256"]}
        opt.out.write_text(json.dumps(report,indent=2)+"\n")
        print(json.dumps(report))
    finally:http(session,"DELETE")
if __name__=="__main__":main()
