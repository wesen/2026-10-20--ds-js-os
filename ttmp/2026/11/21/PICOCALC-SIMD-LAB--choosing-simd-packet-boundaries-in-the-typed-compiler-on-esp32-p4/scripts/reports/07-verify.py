"""Execute each published article cell in a fresh local REPL session and check its answer."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--addr',default='http://127.0.0.1:3794')
p.add_argument('--out',required=True,type=Path)
args=p.parse_args()
here=Path(__file__).resolve().parent
def call(url,method,data=None):
    body=None if data is None else json.dumps(data).encode()
    request=Request(url, data=body, method=method, headers={'Content-Type':'application/json'})
    with urlopen(request,timeout=20) as r:
        raw=r.read()
    return json.loads(raw) if raw else None
def has_expected(key,v):
    if key=='01': return v['packetReads']['observed']==16888 and v['completeFrame']['winningBlocks']==6
    if key=='02': return [row['packets'] for row in v]==[2111,282,742]
    if key=='03': return [row['executedLoads'] for row in v]==[26070,9182,3246] and all(len(row['imageSHA'])==64 for row in v)
    if key=='04': return v['checkedPlanar']['winningBlocks']==12 and v['identicalContactOrder']['winningBlocks']==0 and v['oneTickIncludingConversion']['winningBlocks']==0
    if key=='05': return v['winners']==12 and v['cases']==15 and v['distinctPredictions']==['pie']
    if key=='06': return v['pairs']==72 and v['wins']==72 and sorted(v['opening'])==[465,467,502,515,561,595]
    raise ValueError(key)
receipts=[]
for path in sorted(here.glob('[0-9][0-9]-*.js')):
    sid=subprocess.check_output([sys.executable,str(here.parent/'director/09-open-lab-session.py'),'--addr',args.addr,'--keep'],text=True).strip().split()[-1]
    session=args.addr+'/sessions/'+sid
    try:
        source=path.read_text()
        response=call(session+'/eval','POST',{'source':source})
        assert response['ok'] and has_expected(path.name[:2],response['value']), (path.name,response)
        receipts.append({'script':path.name,'source':source,'value':response['value']})
        print(path.name,'PASS')
    finally:call(session,'DELETE')
assert len(receipts)==6
args.out.write_text(json.dumps(receipts,indent=2)+'\n')
