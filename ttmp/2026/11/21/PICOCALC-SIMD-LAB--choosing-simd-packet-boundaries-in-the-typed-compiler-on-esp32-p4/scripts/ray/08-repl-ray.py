"""Join the experiment's per-mask physical costs to the independently traced census."""
import argparse
import csv
import json
from pathlib import Path
from urllib.request import Request, urlopen

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--addr', default='http://127.0.0.1:3794')
p.add_argument('--session', help='reuse a private lab REPL sandbox')
p.add_argument('--out', type=Path)
args=p.parse_args()
ticket=Path(__file__).resolve().parents[2]
def request(path, body):
    req=Request(args.addr+path, method='POST', data=json.dumps(body).encode(), headers={'Content-Type':'application/json'})
    with urlopen(req, timeout=15) as response:
        return json.load(response)
sid=args.session or request('/sessions',{})['id']
def cell(code):
    result=request('/sessions/'+sid+'/eval',{'source':code})
    if not result['ok']:raise RuntimeError(result)
    return result.get('value')

rows=[]
with (ticket/'various/ray/packet-classes.csv').open() as stream:
    for row in csv.DictReader(stream):
        if row['scene']=='0':
            rows.append({k:int(v) for k,v in row.items()})
cell('var rayOpeningClassRows='+json.dumps(rows)+'; undefined')
query="""(()=>{
 const maskRecords=simd.packets('opening-160-rows').packets;
 const observed=[0,0,0];
 for (const p of maskRecords) observed[p.hitMask===0?0:p.hitMask===255?2:1]++;
 const result=[];
 const median=xs=>xs.slice().sort((a,b)=>a-b)[xs.length>>1];
 for(let group=0;group<3;group++) {
   const byArm=[];
   for(let arm=0;arm<3;arm++) {
     const rows=rayOpeningClassRows.filter(r=>r.class===group&&r.schedule===arm);
     if(rows.length!==9||rows.some(r=>r.packets!==observed[group]||r.all_passed!==1))
       throw Error('arm or packet census mismatch');
     byArm.push(median(rows.map(r=>r.cycles/r.packets)));
   }
   result.push({group,packets:observed[group],medianCyclesPerPacket:byArm});
 }
 return result;
})()"""
res=cell(query)
receipt={'source':query,'result':res,'input':'various/ray/packet-classes.csv (scene=0)','capturedMasks':"simd.packets('opening-160-rows')"}
if args.out: args.out.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(res))
