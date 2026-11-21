"""Reopen the final lab on the merged capture server, with paired physical rows in memory."""
import argparse, hashlib, json
from pathlib import Path
from urllib.request import Request,urlopen

ticket=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--addr',default='http://127.0.0.1:3794')
parser.add_argument('--keep',action='store_true',help='leave the session running and print its ID')
parser.add_argument('--out',type=Path)
args=parser.parse_args()
def req(method,url,body=None):
    data=None if body is None else json.dumps(body).encode()
    r=Request(url,data=data,method=method,headers={'Content-Type':'application/json'})
    with urlopen(r,timeout=30) as h: raw=h.read()
    return json.loads(raw) if raw else {}
sessions=args.addr+'/sessions'
sid=req('POST',sessions)['id'];url=sessions+'/'+sid
def evaluate(src):
    r=req('POST',url+'/eval',{'source':src})
    if not r['ok']:raise RuntimeError(r)
    return r.get('value')
retained=False
try:
    evaluate('const lab = {sources:{}}; undefined')
    for name,path in {'frames':'director/frame-device-rows.json','lengthGate':'director/gate-device-rows.json',
                      'collision':'director/selector-device-rows.json','cold':'director/selector-cold-rows.json',
                      'physics':'physics/board-results.json'}.items():
        raw=(ticket/'various'/path).read_bytes(); rows=json.loads(raw)
        if name=='physics': rows=rows['rows']
        evaluate('lab.'+name+'=[];lab.sources.'+name+'='+json.dumps({'path':path,'sha256':hashlib.sha256(raw).hexdigest()})+';undefined')
        for start in range(0,len(rows),32):
            evaluate('lab.'+name+'.push(...'+json.dumps(rows[start:start+32],separators=(',',':'))+');undefined')
    for key, file in [('images','host-images.json'),('scores','selector-result.json')]:
        raw=(ticket/'various/director'/file).read_bytes()
        evaluate('lab.'+key+'='+raw.decode()+';undefined')
        evaluate('lab.sources.'+key+'='+json.dumps({'path':'director/'+file,'sha256':hashlib.sha256(raw).hexdigest()})+';undefined')
    evaluate((ticket/'scripts/director/10-lab-workbook.js').read_text())
    queries={
        'openingFrame':'lab.frame("default","clean","baseline","empty")',
        'openingPrimary':'lab.frame("default","primary","baseline","empty")',
        'packetPrediction':'lab.packetPrediction()',
        'heldOutShort':'lab.collisionCosts(2,35)',
        'physicsParticle':'lab.physicsPair("particle",128,"guarded-soa-scalar","guarded-soa-pie")',
        'physicsContact':'lab.physicsPair("contact",128,"grouped-scalar","grouped-pie")',
        'gateN3':'lab.gateCosts(3)', 'blindPrediction':'lab.selection("dynamic",3,35)'}
    result={k:{'js':js,'value':evaluate(js)} for k,js in queries.items()}
    result['sources']=evaluate('lab.sources')
    if args.out:args.out.write_text(json.dumps(result,indent=2)+'\n')
    if args.keep: print('Retained session',sid); retained=True
    else: print(json.dumps(result,indent=2))
finally:
    if not retained:req('DELETE',url)
