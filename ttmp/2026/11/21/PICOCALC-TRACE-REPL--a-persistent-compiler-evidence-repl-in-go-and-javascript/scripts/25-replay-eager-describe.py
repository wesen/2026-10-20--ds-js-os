#!/usr/bin/env python3
"""Reproduce the researcher's ready-value versus plan discovery problem on the live service."""
import argparse
import json
from pathlib import Path
from urllib.request import Request,urlopen

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--loops",action="store_true",help="Replay original ordinal 88 and the loop-scope filter")
    p.add_argument("output",type=Path);p.add_argument("--port",type=int,default=3791);p.add_argument("--build",required=True)
    opt=p.parse_args()
    if opt.output.exists():p.error("choose a fresh output")
    root=f"http://127.0.0.1:{opt.port}/sessions"
    def call(url,method,body=None):
        payload=json.dumps({"source":body}).encode() if body else None
        req=Request(url,method=method,data=payload,headers={"Content-Type":"application/json"})
        with urlopen(req,timeout=20) as r:
            b=r.read()
        return json.loads(b) if b else None
    session=root+"/"+call(root,"POST")["id"]
    try:
        examples = [
          'q.run(profiles.arm("checked-llc-nolsr").describe())',
          'profiles.arm("checked-llc-nolsr").describe().arm',
          'q.help("profiles")',
          'q.help("errors")'
        ]
        if opt.loops:
            examples = [
              'q.run(a.variant("checked").events("middle").at(88).select("ordinal","pass","header","scope","ref"))',
              *[f'q.run(a.variant("{v}").events("middle").where(e => e.scope.kind === "loop").count())'
                for v in ("checked","unchecked","firmware")],
            ]
        rows=[{"source":x,"reply":call(session+"/eval","POST",x)} for x in examples]
        opt.output.write_text(json.dumps({"build":opt.build,"examples":rows},indent=2)+"\n")
        print(json.dumps(rows[:2]))
    finally:call(session,"DELETE")
if __name__=="__main__":main()
