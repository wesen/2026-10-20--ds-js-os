from pathlib import Path
from urllib.request import Request,urlopen
import json
t=Path(__file__).resolve().parents[1];url='http://127.0.0.1:3795/sessions'
def post(url,p):
 with urlopen(Request(url,data=json.dumps(p).encode(),headers={'Content-Type':'application/json'})) as r:return json.load(r)
sid=post(url,{})['id']
def run(s):
 r=post(url+'/'+sid+'/eval',{'source':s})
 if not r['ok']:raise RuntimeError(r)
 return r.get('value')
rows=json.loads((t/'various/rows.json').read_text());run('const rows=[];undefined')
for i in range(0,len(rows),64):run('rows.push(...'+json.dumps(rows[i:i+64])+');undefined')
run((t/'scripts/05-query.js').read_text()+'\nundefined')
result=run('({scores,sceneEffects,references,chess:compare("chess","0",1,"homes")})')
(t/'various/result.json').write_text(json.dumps(dict(session=sid,**result),indent=2)+'\n')
print(sid,result['scores']['homes'])
