"""Verify completed physical run and preserve compact results without dumping device logs."""
import argparse, collections, hashlib, json
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("capture",type=Path)
p.add_argument("destination",type=Path)
p.add_argument("--candidate",action="store_true")
a=p.parse_args()
path=a.capture/"bench.log"
lines=path.read_text(errors="replace").splitlines()
assert any("SIMDLAB END" in s for s in lines)
assert not any("SHERROR" in s for s in lines),[s for s in lines if "SHERROR" in s]
rows=[]
for line in lines:
    if "SHCOLD " in line:
        q=json.loads(line.partition("SHCOLD ")[2]);assert q["match"]
        rows.append(dict(kind="cold",**q))
    if "SHROW " not in line: continue
    kind, *v=line.partition("SHROW ")[2].split()
    if kind=="pred":
        pose,k,b,arm,n,cy=v
        row=dict(pose=pose,path=int(k),block=int(b),arm=int(arm),n=int(n),cycles=int(cy))
    elif kind=="frame":
        pose,phase,b,arm,us=v
        row=dict(pose=pose,phase=int(phase),block=int(b),arm=int(arm),us=int(us))
    elif kind=="chess":
        pos,adv,b,arm,n,cy=map(int,v)
        row=dict(position=pos,advanced=adv,block=b,arm=arm,n=n,cycles=cy)
    else: raise ValueError(kind)
    rows.append(dict(kind=kind,**row))
counts=collections.Counter(r["kind"] for r in rows)
expected={"pred":576,"frame":864,"chess":72,"cold":36} if a.candidate else {"pred":80,"frame":24}
assert counts==expected,(counts,expected)
unique={tuple(sorted((k,v) for k,v in r.items() if k not in {"us","cycles","totalUs","compileUs","peakBytes"})) for r in rows}
assert len(unique)==len(rows)
receipt={"rows":dict(counts),"benchSHA":hashlib.sha256(path.read_bytes()).hexdigest(),
         "diagnostic":json.loads((a.capture/"image.json").read_text()),
         "restoreSHA":json.loads((a.capture/"after.json").read_text())["sha256"],
         "afterHealth":(a.capture/"after.json").is_file()}
a.destination.mkdir(parents=True,exist_ok=True)
(a.destination/"rows.jsonl").write_text("".join(json.dumps(row,separators=(",",":"))+"\n" for row in rows))
(a.destination/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps(receipt))
