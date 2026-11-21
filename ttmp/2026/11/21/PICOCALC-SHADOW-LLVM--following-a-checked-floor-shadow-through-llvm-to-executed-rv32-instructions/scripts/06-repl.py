"""Open a live trace session, run the printed JS cells and retain their exact results."""
from pathlib import Path
from urllib.request import Request,urlopen
import json,re,sys
t=Path(__file__).resolve().parents[1]
def post(url,payload):
    req=Request(url,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    with urlopen(req,timeout=45) as response:return json.load(response)
url='http://127.0.0.1:3795/sessions'
sid=post(url,{})['id']
def evaluate(s):
    r=post(url+'/'+sid+'/eval',{'source':s})
    if not r['ok']:raise RuntimeError((s[:160],r))
    return r.get('value')
irOnly='--ir-only' in sys.argv
if not irOnly:
    census=json.loads((t/'various/native/pcs.json').read_text())
    evaluate('const census='+json.dumps({k:{f:x for f,x in v.items() if f!='pcs'} for k,v in census.items()})+';undefined')
    rows=json.loads((t/'various/device/rows.json').read_text())
    evaluate('const board=[];undefined')
    for i in range(0,len(rows),64):evaluate('board.push(...'+json.dumps(rows[i:i+64])+');undefined')
parts=re.split('^// %% (.*)\n',(t/'scripts/05-cells.js').read_text(),flags=re.M)
out=[]
for i in range(1,len(parts),2):
    if irOnly and i>=11:break
    code=parts[i+1].strip()
    r=evaluate(code);out.append(dict(question=parts[i],js=code,value=r));print(parts[i],str(r)[:380])
target=t/'various'/('ir-session.json' if irOnly else 'repl.json')
target.write_text(json.dumps(dict(session=sid,address=url,cells=out),indent=2)+'\n')
print(sid)
