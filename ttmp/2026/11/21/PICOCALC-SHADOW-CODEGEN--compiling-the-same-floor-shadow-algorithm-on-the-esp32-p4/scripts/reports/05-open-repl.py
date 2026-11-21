"""Open the complete shadow study as a persistent JavaScript REPL session and reproduce the results."""
import argparse, hashlib, json
from pathlib import Path
from urllib.request import Request, urlopen

ticket=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument("--addr",default="http://127.0.0.1:3794")
p.add_argument("--save",action="store_true",help="record summary and the persistent session receipt in the ticket")
args=p.parse_args()
def request(method,url,body=None):
    r=Request(url,method=method,data=None if body is None else json.dumps(body).encode(),headers={"Content-Type":"application/json"})
    with urlopen(r,timeout=40) as resp: return json.load(resp)
url=args.addr+"/sessions"
sid=request("POST",url)["id"]
def evaluate(source):
    result=request("POST",url+"/"+sid+"/eval",{"source":source})
    if not result["ok"]: raise ValueError(result)
    return result.get("value")
evaluate("const lab={rows:[]};undefined")
raw=(ticket/"various/board/final/rows.jsonl").read_bytes()
rows=[json.loads(line) for line in raw.splitlines()]
for i in range(0,len(rows),48):
    evaluate("lab.rows.push(..."+json.dumps(rows[i:i+48],separators=(",",":"))+");undefined")
evaluate("lab.paths="+(ticket/"various/board/paths.json").read_text()+";undefined")
code=(ticket/"scripts/reports/shadow.js").read_text()
evaluate(code+"\nundefined")
score=json.loads(evaluate("JSON.stringify(lab.score())"))
if args.save:
    out=ticket/"various/director"
    (out/"summary.json").write_text(json.dumps(score,indent=2)+"\n")
    (out/"session.json").write_text(json.dumps(dict(id=sid,endpoint=args.addr,rows=len(rows),
        rowsSHA=hashlib.sha256(raw).hexdigest(),querySHA=hashlib.sha256(code.encode()).hexdigest()),indent=2)+"\n")
print(json.dumps(dict(session=sid,opening=score["frame"]["default"]["full"],chess=score["chess"])))
