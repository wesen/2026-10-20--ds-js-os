"""Export the qualified instruction counts under the REPL's p4-simd-evidence-v1 format."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("build",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    scripts=Path(__file__).resolve().parent
    roots={"native":scripts/"physics.S","typed":scripts/"physics.typed","guard":scripts/"board/physics_checked.S"}
    rows=json.loads((args.build/"pc-traces.json").read_text())
    images=[];decisions=[];traces=[]
    for kind,source in roots.items():
        blob=(args.build/(kind+".bin")).read_bytes(); sha=hashlib.sha256(blob).hexdigest()
        images.append({"sha256":sha,"code":base64.b64encode(blob).decode()})
        listing=(args.build/(kind+".dis")).read_text()
        code={int(x[1],16):x[2] for x in re.finditer(r"^\s*([0-9a-f]+):\s+[0-9a-f]{8}\s+(\S+)",listing,re.M)}
        symbols={x[2]:int(x[1],16) for x in re.finditer(r"^([0-9a-f]+) <(\w+)>:$",listing,re.M)}
        src=source.read_bytes(); lines=src.decode().splitlines()
        names=sorted({r["kernel"] for r in rows if r["imageSHA"]==sha})
        for name in names:
            if kind=="native": line=lines.index(name+":")+1; key=name
            elif kind=="guard": line=next(i for i,s in enumerate(lines,1) if s.startswith("guarded guarded_") and s.split(",")[0].endswith(name));key=name.replace("guarded_","particle_")
            else:
                bare=name.removeprefix("physics_typed_");line=next(i for i,s in enumerate(lines,1) if s.startswith("function "+bare+"("));key=name
            lo=symbols[key]; hi=min((v for v in symbols.values() if v>lo),default=len(blob))
            ranges=[{"start":lo,"end":hi,"role":"native-helper" if kind=="guard" else "entry-body"}]
            for pc,op in code.items():
                if lo<=pc<hi and op.startswith("esp."):
                    role="packed-load" if op.startswith("esp.vld") else "packed-store" if op.startswith("esp.vst") else "packed-arithmetic"
                    ranges.append({"start":pc,"end":pc+4,"role":role})
            plan="stock-streaming-rv32" if kind=="typed" else "manual-"+("checked-" if kind=="guard" else "")+("packed" if name.endswith("_pie") else "scalar")
            decisions.append({"id":"physics-"+name, "function":name, "source":{"path":str(source.relative_to(Path.cwd())),"sha256":hashlib.sha256(src).hexdigest(),"lineStart":line,"lineEnd":line},"imageSHA":sha,"plan":plan,"alternatives":[{"plan":plan,"status":"selected","reason":"Experiment-arm assignment; manual selection, no compiler profitability prediction."}],"ranges":ranges})
        for r in rows:
            if r["imageSHA"]!=sha:continue
            traces.append({"id":"physics-"+r["kernel"]+"-"+r["workload"].replace(":","-"),"imageSHA":sha,"workload":r["workload"],"steps":r["steps"],"counts":r["counts"]})
    data={"format":"p4-simd-evidence-v1","images":images,"decisions":decisions,"traces":traces,"packetSets":[]}
    args.output.write_text(json.dumps(data,separators=(",",":"))+"\n")
    print(len(images),"images",len(decisions),"decisions",len(traces),"complete traces")
if __name__=="__main__":main()
