"""Run the checked-in cell as a new session and retain an independent receipt."""
import argparse,hashlib,json,urllib.request
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=3793)
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--cell',type=Path,default=Path(__file__).with_name('04-simd-workbook.js'))
    args=parser.parse_args()
    cell=args.cell.read_text()
    base=f'http://127.0.0.1:{args.port}/sessions'
    def call(verb,url,data=None):
        req=urllib.request.Request(url,method=verb,data=data,headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=30) as r:return r.read()
    room=base+'/'+json.loads(call('POST',base))['id']
    try:reply=json.loads(call('POST',room+'/eval',json.dumps({'source':cell}).encode()))
    finally:call('DELETE',room)
    if not reply['ok']:raise RuntimeError(reply)
    args.out.write_text(json.dumps({'cellSHA':hashlib.sha256(cell.encode()).hexdigest(),'result':reply['value']},indent=2)+'\n')
if __name__=='__main__':main()
