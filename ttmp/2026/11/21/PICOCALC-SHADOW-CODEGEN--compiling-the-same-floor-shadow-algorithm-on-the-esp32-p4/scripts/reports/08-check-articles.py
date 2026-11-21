"""Replay every JavaScript block printed in the two study chapters on the live service."""
import json,re,sys
from pathlib import Path
from urllib.request import Request,urlopen
t=Path(__file__).resolve().parents[2]
session=json.loads((t/"various/director/session.json").read_text())
url=session["endpoint"]+"/sessions/"+session["id"]+"/eval"
checks=[]
for p in sorted((t/"analysis").glob("*.md")):
    for match in re.finditer(r"(?P<f>```|~~~)(?:javascript|js)\n(.*?)\n(?P=f)",p.read_text(),re.S):
        body=json.dumps({"source":match[2]}).encode()
        with urlopen(Request(url,data=body,headers={"Content-Type":"application/json"})) as resp:
            r=json.load(resp)
        if not r["ok"]:raise ValueError(r)
        checks.append({"chapter":p.name,"value":r["value"]})
assert len(checks)==2
out=json.dumps(checks,indent=2)+"\n"
if len(sys.argv)>1:Path(sys.argv[1]).write_text(out)
print(out)
