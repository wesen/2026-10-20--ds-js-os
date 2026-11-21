"""Time three compilers on the same device, then verify and restore the pinned playable image."""
from itertools import permutations
from pathlib import Path
import json
import sys

repo=Path(__file__).resolve().parents[6]
nov20=repo/'ttmp/2026/11/20'
sys.path.insert(0,str(next(nov20.glob('PICOCALC-RAYTRACE--*'))/'scripts/device'))
from board_common import acquire,check_build,health,release,save

stage, artifact, previous, out = [Path(a).resolve() for a in sys.argv[1:5]]
port=sys.argv[5] if len(sys.argv)>5 else '/dev/ttyACM0'
trial=stage/'build'
build=json.loads((artifact/'build.json').read_text())
ids={i['id']:i for i in json.loads((artifact/'images.json').read_text())}
controls=[r for r in json.loads((next(nov20.glob('PICOCALC-TYPED-RAY--*'))/'various/device/rows.json').read_text()) if r['rep']==0 and r['program']==0]
assert len(controls)==12
check_build(previous,build['baseAppSHA']);check_build(trial,build['appSHA'])
out.mkdir(parents=True,exist_ok=False)
with acquire(), (out/'uart.log').open('wb',buffering=0) as log:
    connect=lambda:release.unit.Console(port,log)
    flash=lambda op,img,tag:release.esp(op,img,out,tag,port)
    c=connect()
    release.hold(c);flash('verify_flash',previous,'prior-readback')
    c=connect();health(c);release.hold(c)
    try:
        flash('write_flash',trial,'trial-app');flash('verify_flash',trial,'trial-readback')
        c=connect();health(c)
        rows=[];loads=[]
        for block,order in enumerate(permutations([0,8,5])):
            for pos,id_ in enumerate(order):
                lines=c.command('typedray load '+str(id_),timeout=25)
                load,=[json.loads(l[7:]) for l in lines if l.startswith('TRLOAD ')]
                match,=[m for l in lines if (m:=release.COMPILE.match(l))]
                assert load['program']==id_ and load['elfCRC']==ids[id_]['crc'] and match[3]=='ok',lines
                loads.append(load|{'block':block,'position':pos,'compilerUs':int(match[4]),'peakJSBytes':int(match[5])})
                save(out/'loads.json',loads)
                for i,ref in enumerate(controls[block:]+controls[:block]):
                    rot=(block+pos+i)%3
                    args=[*ref['pose'],ref['stride'],rot]
                    lines=c.command('typedray bench '+' '.join(map(str,args)),timeout=25)
                    row,=[json.loads(l[6:]) for l in lines if l.startswith('TRROW ')]
                    assert row['program']==id_ and row['pose']==ref['pose'] and row['stride']==ref['stride'] and row['rotation']==rot
                    assert row['crc']==ref['crc']
                    rows.append(row|{'block':block,'fixture':ref['fixture']})
                save(out/'rows.json',rows)
                print('verified blocks',len(rows),flush=True)
    finally:
        try:
            if c.port.is_open: release.hold(c)
        except Exception as error: print('hold for restore:',error,flush=True)
        flash('write_flash',previous,'restored-app');flash('verify_flash',previous,'restored-readback')
        c=connect()
        try:save(out/'restored.json',{'sha256':build['baseAppSHA'],'health':health(c)})
        finally:c.close()
