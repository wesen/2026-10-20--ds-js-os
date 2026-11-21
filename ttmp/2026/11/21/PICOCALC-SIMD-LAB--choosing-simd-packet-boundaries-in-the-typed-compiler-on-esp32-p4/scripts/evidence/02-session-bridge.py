"""Relay numbered cells into one private HTTP REPL room. No shell execution."""
import json, time, urllib.request, sys
from pathlib import Path
room=Path(sys.argv[1]).resolve()
base="http://127.0.0.1:3792/sessions"
def query(url,method,body=None):
    r=urllib.request.Request(url,method=method,data=body,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(r,timeout=20) as resp:
        return resp.read()
sid=json.loads(query(base,'POST'))['id']
try:
    for i in range(1,65):
        path=room/f"request-{i}.json"
        while not path.is_file() and not (room/'.close-room').exists():
            time.sleep(.25)
        if not path.is_file():break
        data=path.read_bytes()
        try:
            cell=json.loads(data)
            if len(data)>12000 or not isinstance(cell.get('source'),str):
                raise ValueError("invalid cell")
            reply=query(base+'/'+sid+'/eval','POST',json.dumps({'source':cell['source']}).encode())[:32000]
        except Exception as exc:
            reply=json.dumps({'error':str(exc)}).encode()
        temp=room/f"reply-{i}.tmp"
        temp.write_bytes(reply)
        temp.replace(room/f"reply-{i}.json")
finally:
    query(base+'/'+sid,'DELETE')
