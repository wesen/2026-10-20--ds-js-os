"""Compare complete physical C & Typed renderer planes, latency and ordinary UI."""
import argparse, json, subprocess, sys, time, zlib
from pathlib import Path
ticket=Path(__file__).resolve().parents[2]
repo=next(p for p in ticket.parents if (p/'.git').exists())
ray=next(ticket.parent.glob('PICOCALC-RAYTRACE--*'))
sys.path.insert(0,str(ray/'scripts/device'))
from board_common import acquire,check_build,health,release,save

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('build',type=Path);p.add_argument('sha');p.add_argument('out',type=Path)
p.add_argument('--previous',type=Path,default=Path('/tmp/picocalc-candela-device/build'))
p.add_argument('--previous-sha',default='f3dc689a28dc1db1d3e91a44a288a87144b63e7b3005c3eefbec71d844008951')
p.add_argument('--programs',default='0,1,2,3')
p.add_argument('--port',default='/dev/ttyACM0')
a=p.parse_args()
programs=list(map(int,a.programs.split(',')));assert len(set(programs))==len(programs) and all(0<=x<=7 for x in programs)
check_build(a.build,a.sha);check_build(a.previous,a.previous_sha)
assert a.sha!=a.previous_sha
a.out.mkdir(parents=True,exist_ok=False)
host=a.out/'host';host.mkdir()
nucleus=repo/'picocalc-os/nucleus'
for harness,src in [('reference',ticket/'scripts/renderer/01-reference.c'),('frame',ray/'scripts/device/host_frame.c')]:
    subprocess.run(['cc','-std=c11','-O2','-I',nucleus,src,nucleus/'raytrace_demo.c','-o',host/harness],check=True)
cases=json.loads(subprocess.check_output([host/'reference',host]))
checks={}
for case in cases:
    name=case['name'];stride=case['stride'];hashes=[]
    for label in ['color','depth','id']:
        plane=(host/(name+'.'+label)).read_bytes()[2:];buffer=bytearray(b'\xaa\xaa'*(159*stride+160))
        for y in range(160):buffer[2*y*stride:2*(y*stride+160)]=plane[2*y*stride:2*(y*stride+160)]
        hashes.append(f'{zlib.crc32(buffer):08x}')
    checks[name]=hashes

def parse(lines,prefix):
    data=[json.loads(s[len(prefix):]) for s in lines if s.startswith(prefix)]
    if len(data)!=1:raise ValueError((prefix,lines[-8:]))
    return data[0]

def load(c,program):
    lines=c.command('typedray load '+str(program),timeout=30)
    result=parse(lines,'TRLOAD ')
    m=next((release.COMPILE.match(s) for s in lines if release.COMPILE.match(s)),None)
    assert result['program']==program and m and m[3]=='ok'
    return result|{'compilerUs':int(m[4]),'quickjsPeakBytes':int(m[5])}

def capture(c,label,keys,pose):
    for k in keys:c.command('key '+k);time.sleep(.38)
    expected=subprocess.check_output([host/'frame','frame',*map(str,pose)])
    view=b''.join(expected[p:p+2] for y in range(240) for x in range(240) for p in [2*(160*(2*y//3)+2*x//3)])
    for _ in range(4):
        shot=c.shot(label,a.out)
        raw=(a.out/(label+'.rgb565')).read_bytes()
        got=b''.join(raw[2*((32+y)*320+40):2*((32+y)*320+280)] for y in range(240))
        if got==view:break
        time.sleep(.3)
    assert got==view,(label,hex(zlib.crc32(got)),hex(zlib.crc32(view)))
    return dict(label=label,scene=pose,viewCRC=f'{zlib.crc32(got):08x}',pixels=57600,framebuffer=shot,pngSHA=release.sha(a.out/(label+'.png')))

with acquire(),(a.out/'uart.log').open('wb',buffering=0) as log:
    def connect():return release.unit.Console(a.port,log)
    def esp(op,build,tag):release.esp(op,build,a.out,tag,a.port)
    c=connect();release.hold(c);esp('verify_flash',a.previous,'previous-readback');c=connect()
    before=health(c);release.hold(c)
    try:
        esp('write_flash',a.build,'candidate-app');esp('verify_flash',a.build,'candidate-readback')
        c=connect();health(c)
        rows=[];loads=[]
        for rep in range(3):
            for program in programs[rep%len(programs):]+programs[:rep%len(programs)]:
                loads.append(load(c,program)|{'rep':rep});save(a.out/'loads.json',loads)
                for j,case in enumerate(cases):
                    stride=case['stride'];pose=case['scene'];rotation=(rep+j+program)%3
                    cmd='typedray bench '+' '.join(map(str,[*pose,stride,rotation]))
                    row=parse(c.command(cmd,timeout=15),'TRROW ')
                    assert (row['program'],row['pose'],row['stride'],row['rotation'])==(program,pose,stride,rotation)
                    assert row['crc']==checks[case['name']],(case,row)
                    assert all(i>0 for arm in row['timesUs'] for i in arm)
                    rows.append(row|{'rep':rep,'fixture':case['name']});save(a.out/'rows.json',rows)
                print(rep,program,'poses',len(rows),flush=True)
        load(c,0)
        candela=next(ticket.parent.glob('PICOCALC-CANDELA--*'))
        controls=json.loads((candela/'various/review/rows.json').read_text())
        expected={(x['fixture'],x['weight']):x['crc'] for x in controls}
        material=[]
        for block in range(3):
            for (fixture,weight),crc in expected.items():
                for first in ((block+fixture)%2,1-(block+fixture)%2):
                    row=parse(c.command(f'typedmat bench {fixture} {weight} {first}',timeout=25),'TRMAT ')
                    assert (row['fixture'],row['weight'],row['first'])==(fixture,weight,first),row
                    assert row['equal'] and row['crc']==crc and min(row['typedUs'],row['mixedUs'])>0,row
                    material.append(row|{'block':block});save(a.out/'materials.json',material)
        c.command('typedmat drop')
        controls=[('typed-default',('f1','v','g','g','g'),[68,61,31,25]),
                  ('typed-right',('right',),[76,61,31,25]),('typed-relit',('w',),[76,61,31,17]),
                  ('classic-reset',('r',),[68,61,31,25])]
        screens=[]
        prior=parse(c.command('typedray status'),'TRSTATUS ')
        for label,keys,pose in controls:
            screen=capture(c,label,keys,pose)
            status=parse(c.command('typedray status'),'TRSTATUS ')
            if label.startswith('typed'):
                assert status['program']==0 and status['pose']==pose and status['frames']>prior['frames'],status
            else:assert status['frames']==prior['frames']
            screens.append(screen|{'typedState':status});prior=status;save(a.out/'screens.json',screens)
        assert [s['viewCRC'] for s in screens]==[s['actualCRC'] for s in json.loads((ray/'various/device/screens.json').read_text())]
        c.command('key f1');health(c);release.hold(c);esp('verify_flash',a.build,'final-readback')
        c=connect();live=health(c)
        # Re-enter the normal Typed screen after flash readback and leave it visible for the user.
        live_screen=capture(c,'handoff',('f1','v','g','g','g'),[68,61,31,25])
        state=parse(c.command('typedray status'),'TRSTATUS ')
        assert state['frames'] and state['pose']==[68,61,31,25] and state['program']==0
        save(a.out/'final.json',dict(qualified=True,typedState=state,revision=(a.build.parent/'revision').read_text().strip(),appSHA=a.sha,
             previousSHA=a.previous_sha,partitionSHA=release.PART_SHA,programs=programs,poseBlocks=len(rows),health=live,liveScreen=live_screen))
        print('QUALIFIED',a.sha,flush=True)
    except BaseException as exc:
        print('qualification failed',repr(exc),flush=True)
        try:
            if c.port.is_open:release.hold(c)
        except Exception as hold_error:print('recovery hold',hold_error,flush=True)
        esp('write_flash',a.previous,'rollback-app');esp('verify_flash',a.previous,'rollback-readback')
        c=connect();save(a.out/'rollback.json',dict(appSHA=a.previous_sha,health=health(c)))
        raise
    finally:c.close()
