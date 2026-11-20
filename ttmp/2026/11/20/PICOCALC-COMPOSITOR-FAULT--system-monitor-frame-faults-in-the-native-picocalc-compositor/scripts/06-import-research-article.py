"""Import only the researcher's public text and a minimal model receipt from Claude CLI JSON."""
import argparse
import hashlib
import json
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("lane",choices=["producer","receiver"])
ap.add_argument("json_file",type=Path)
args = ap.parse_args()
messages=json.loads(args.json_file.read_text())
result=next(x for x in reversed(messages) if x["type"]=="result")
if result["is_error"] or "claude-opus-4-6" not in result["modelUsage"]:
    raise ValueError("missing successful Opus 4.6 result")
text=result["result"]
article,diary=text.split("---DIARY---")
if not all(word in diary.lower() for word in ["step 1","step 2","code review instructions"]):
    raise ValueError("diary is incomplete")
receipt={"lane":args.lane,"model":"claude-opus-4-6","effort":"high",
         "publicResponseSha256":hashlib.sha256(text.encode()).hexdigest()}
(ticket/"various"/f"{args.lane}-author.json").write_text(json.dumps(receipt,indent=2)+"\n")
a,d=("01","02") if args.lane=="producer" else ("02","03")
for folder,prefix,body in [("analysis",a,article),("reference",d,diary)]:
    path,=(ticket/folder).glob(prefix+"-*.md")
    head=path.read_text().split("\n---\n",1)[0]+"\n---\n\n"
    if folder=="reference":
        body="# "+args.lane.capitalize()+" researcher diary\n\n"+body.strip()
    path.write_text(head+body.strip()+"\n")
