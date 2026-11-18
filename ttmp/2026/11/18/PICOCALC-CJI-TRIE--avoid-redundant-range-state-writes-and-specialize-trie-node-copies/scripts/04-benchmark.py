"""Rotate three independent experiments and the guarded control, verifying every IR."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from statistics import median
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('scratch', type=Path)
parser.add_argument('guard', type=Path)
parser.add_argument('refs', type=Path)
args=parser.parse_args()
names=['guard','reuse','typed','both']
executables={name:(args.guard if name=='guard' else args.scratch/name/'stage1') for name in names}
worlds={}
for world in ['agenda','files']:
    expected=(args.refs/f'{world}.ref').read_bytes()
    rows=[]
    for i in range(-1,4):
        offset=max(0,i)
        for name in names[offset:]+names[:offset]:
            run=subprocess.run([executables[name],'-C','-g','-h','8388608','-H','8388608','--',
                                f'picocalc-os/js/apps/{world}.js','--world-unit'],capture_output=True,check=True)
            if run.stdout != expected: raise ValueError((world,name,'output mismatch'))
            msg=run.stderr.decode()
            metrics={k:int(v) for k,v in re.findall(r'(frontend_us|gc_us|slide_bytes)=(\d+)',msg)}
            metrics['collections']=int(re.search(r'cji: (\d+) collections',msg)[1])
            metrics['live_peak_bytes']=int(re.search(r'most live (\d+) bytes',msg)[1])
            rows.append(dict(warmup=i<0,round=i,variant=name,**metrics))
            print(world,i,name,metrics['frontend_us'],flush=True)
    worlds[world]=dict(rows=rows,slir_sha256=hashlib.sha256(expected).hexdigest(),
                       medians={name:median(r['frontend_us'] for r in rows if not r['warmup'] and r['variant']==name) for name in names})
receipt=dict(images={k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in executables.items()},worlds=worlds)
(args.scratch/'native.json').write_text(json.dumps(receipt,indent=2)+'\n')
