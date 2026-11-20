"""Build in a temporary tree, compare all ordered frame pairs, and retain reviewable measurements."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
here=Path(__file__).resolve().parent
day=here.parents[2]
scene=next(day.glob('PICOCALC-CHESS-3D--*'))
frozen=json.loads((scene/'various/host-poses.json').read_text())['cases']
root=here.parents[6]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--matrix',type=Path)
parser.add_argument('--sanitize',action='store_true')
args=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='picocalc-damage-host-') as tmp:
    tmp=Path(tmp)
    subprocess.run(['python3','-B',str(scene/'scripts/scene/stage.py'),str(tmp)],check=True)
    subprocess.run(['python3','-B',str(here/'prepare.py'),'--oracle',str(tmp/'oracle.bin')],check=True)
    staged=tmp/'picocalc-os/nucleus'
    original=root/'picocalc-os/nucleus'
    cc=['cc','-std=gnu11','-O2','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-Wno-missing-field-initializers','-Wno-misleading-indentation','-ffunction-sections','-fdata-sections']
    if args.sanitize: cc+=['-fsanitize=undefined','-fno-sanitize-recover=all']
    command=cc+['-I',str(staged),'-I',str(original),str(here/'host.c'),str(here/'damage.c'),
                str(staged/'painter_commands.c'),str(original/'gfx.c'),str(original/'util.c'),
                '-Wl,--gc-sections','-o',str(tmp/'host')]
    subprocess.run(command,check=True)
    data=subprocess.check_output([tmp/'host',here/'corpus.bin',tmp/'oracle.bin'],text=True)
if args.matrix: args.matrix.write_text(data)
rows=[{k:int(v) for k,v in r.items()} for r in csv.DictReader(io.StringIO(data))]
assert len(rows)==51**2
for r in rows:
    a,b=frozen[r['old']],frozen[r['new']]
    assert bool(r['hints_changed'])==(a['hints']!=b['hints'])
    assert bool(r['different'])==(a['bodySha256']!=b['bodySha256'])
    if a['pitch']!=b['pitch']: assert r['mode']==2
names={r['name']:i for i,r in enumerate(frozen)}
examples=[('cursor-up','e2','e3'),('cursor-right','e3','f3'),('unchanged','e2','pos-1'),
          ('move-e4','pos-9','pos-10'),('engine-knight','pos-11','pos-12'),('promotion','pos-24','pos-25'),
          ('castle-short','pos-34','pos-35'),('castle-long','pos-39','pos-40'),('en-passant','pos-44','pos-45'),
          ('camera','e2','low'),('hint-only','pos-22','pos-23')]
out=[]
for label,a,b in examples:
    r=rows[names[a]*51+names[b]]
    out.append({'name':label,'old':a,'new':b,
                'mode':['none','partial','full'][r['mode']],
                'area':(r['x1']-r['x0'])*(r['y1']-r['y0']),
                'box':[r[k] for k in ('x0','y0','x1','y1')],
                'idealPixels':r['different'],'idealBBoxArea':(r['ideal_x1']-r['ideal_x0'])*(r['ideal_y1']-r['ideal_y0']),
                'replayed':r['records'] if r['mode']!=2 else None,
                'hintsChanged':bool(r['hints_changed'])})
report={'frames':51,'orderedPairs':len(rows),'fullReferenceFrames':51,'consecutiveApplications':50,
        'headerAndHintPixelsPreservedPerPair':320*40,'bodyPixelsComparedPerPair':320*280,
        'corpusSHA256':hashlib.sha256((here/'corpus.bin').read_bytes()).hexdigest(),
        'identicalBodies':sum(r['different']==0 for r in rows),
        'none':sum(r['mode']==0 for r in rows),'partial':sum(r['mode']==1 for r in rows),'full':sum(r['mode']==2 for r in rows),
        'unchangedBodyWithChangedHintPairs':sum(not r['different'] and r['hints_changed'] for r in rows),
        'matrixSHA256':hashlib.sha256(data.encode()).hexdigest(),'examples':out}
args.output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='examples'}))
