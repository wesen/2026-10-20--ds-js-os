"""Verify all seven scalar conditions over 12 known poses and leave the verified ordinary release running."""
import argparse,json,sys,time,zlib
from pathlib import Path
ticket=Path(__file__).resolve().parents[2]
yesterday=ticket.parent.parent/'20'
previous=next(yesterday.glob('PICOCALC-TYPED-RAY--*'))
sys.path.insert(0,str(next(yesterday.glob('PICOCALC-RAYTRACE--*'))/'scripts/device'))
from board_common import acquire,check_build,health,release,save
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('build',type=Path);p.add_argument('sha');p.add_argument('out',type=Path)
p.add_argument('--previous',type=Path,default=Path('/tmp/picocalc-typed-ray-verified-final/build'))
p.add_argument('--addendum-control',type=Path,help='qualified physical factors directory for the held-out shadow trial')
p.add_argument('--reference-views',type=Path,help='directory of previously verified full RGB565 captures')
p.add_argument('--port',default='/dev/ttyACM0')
a=p.parse_args()
old=json.loads(((a.addendum_control or previous/'various/device')/'final.json').read_text())
assert old['qualified']
check_build(a.previous,old['appSHA']);check_build(a.build,a.sha);assert a.sha!=old['appSHA']
controls=[r for r in json.loads((previous/'various/device/rows.json').read_text()) if r['rep']==0 and r['program']==0]
assert len(controls)==12
programs=[0,14] if a.addendum_control else [0,9,10,11,12,13,8]
reps=8 if a.addendum_control else len(programs)
images={r['id']:r for r in json.loads((a.build.parent/'factor-images.json').read_text())}
assert set(programs)<=set(images)
a.out.mkdir(parents=True,exist_ok=False)
def parse(c,cmd,key):
    lines=c.command(cmd,timeout=25);v=[json.loads(s[len(key):]) for s in lines if s.startswith(key)]
    assert len(v)==1,(cmd,lines[-4:]);return v[0]
def load(c,id):
    cmd=f'typedray load {id}';lines=c.command(cmd,timeout=25)
    result=[json.loads(s[len('TRLOAD '):]) for s in lines if s.startswith('TRLOAD ')]
    compile=[m for s in lines if (m:=release.COMPILE.match(s))]
    assert len(result)==len(compile)==1 and result[0]['program']==id and compile[0][3]=='ok',lines[-4:]
    if id in images:
        assert result[0]['elfCRC']==images[id]['elfCRC'] and result[0]['sourceBytes']==images[id]['sourceBytes'],(id,result[0],images[id])
    return result[0]|{'compilerUs':int(compile[0][4]),'peakJSBytes':int(compile[0][5])}
def viewport(raw):return b''.join(raw[2*((32+y)*320+40):2*((32+y)*320+280)] for y in range(240))
def check_ui(c,label,expected_crc,pose,keys):
    for key in keys:c.command('key '+key);time.sleep(.39)
    for _ in range(4):
        screen=c.shot(label,a.out);raw=viewport((a.out/(label+'.rgb565')).read_bytes())
        if f'{zlib.crc32(raw):08x}'==expected_crc:break
        time.sleep(.3)
    assert f'{zlib.crc32(raw):08x}'==expected_crc,(label,expected_crc,f'{zlib.crc32(raw):08x}')
    if a.reference_views:
        # The addendum can also compare the complete viewport captured in its predecessor.
        reference=viewport((a.reference_views/(label+'.rgb565')).read_bytes())
        assert raw==reference
    status=parse(c,'typedray status','TRSTATUS ')
    assert status['pose']==pose and status['program']==0 and status['frames']>0
    return dict(framebuffer=screen,viewCRC=expected_crc,pose=pose,state=status,pngSHA=release.sha(a.out/(label+'.png')))
with acquire(),(a.out/'uart.log').open('wb',buffering=0) as log:
    def connect():return release.unit.Console(a.port,log)
    def flash(op,build,label):release.esp(op,build,a.out,label,a.port)
    c=connect();release.hold(c);flash('verify_flash',a.previous,'previous-readback')
    c=connect();health(c);release.hold(c)
    try:
        flash('write_flash',a.build,'candidate-app');flash('verify_flash',a.build,'candidate-readback')
        c=connect();health(c)
        rows=[];loads=[]
        for block in range(reps):
            shift=3*block%len(programs)
            for position,program in enumerate(programs[shift:]+programs[:shift]):
                loads.append(load(c,program)|{'block':block,'position':position});save(a.out/'loads.json',loads)
                for j,ref in enumerate(controls[block:]+controls[:block]):
                    rot=(block+j+position)%3
                    args=[*ref['pose'],ref['stride'],rot]
                    row=parse(c,'typedray bench '+' '.join(map(str,args)),'TRROW ')
                    assert (row['pose'],row['stride'],row['rotation'],row['program'])==(ref['pose'],ref['stride'],rot,program)
                    assert row['crc']==ref['crc'],(program,ref['fixture'],row['crc'])
                    for us,cycles in zip(row['timesUs'],row['cycles'],strict=True):
                        assert len(us)==len(cycles)==4 and all(u>0 and 346<cy/u<374 for u,cy in zip(us,cycles,strict=True))
                    rows.append(row|{'fixture':ref['fixture'],'block':block,'position':position})
                save(a.out/'rows.json',rows)
                print('checked',block,program,len(rows),flush=True)
        # The prior public firmware still has nine ordinary research selectors, including programmable diagnostics.
        regress=[]
        for program in range(14 if a.addendum_control else 9):
            load(c,program);r=parse(c,'typedray bench 68 61 31 25 160 0','TRROW ')
            assert r['crc']==controls[0]['crc'];regress.append(r)
        save(a.out/'retained.json',regress);load(c,0)
        screens=json.loads((previous/'various/device/screens.json').read_text())
        ui=[]
        for ref,keys in zip(screens[:3],[('f1','v','g','g','g'),('right',),('w',)],strict=True):
            ui.append(check_ui(c,ref['label'],ref['viewCRC'],ref['scene'],keys))
        assert all(after['state']['frames']>before['state']['frames'] for before,after in zip(ui,ui[1:]))
        save(a.out/'screens.json',ui)
        c.command('key f1');health(c);release.hold(c);flash('verify_flash',a.build,'final-readback')
        c=connect();health(c)
        for ref,keys in zip(screens[:3],[('f1','v','g','g','g'),('right',),('w',)],strict=True):
            check_ui(c,ref['label'],ref['viewCRC'],ref['scene'],keys)
        screen=check_ui(c,'handoff','4b91a3c8',[68,61,31,25],('left','s'))
        normal=health(c)
        assert b'compositor crashed' not in (a.out/'uart.log').read_bytes()
        save(a.out/'final.json',dict(qualified=True,appSHA=a.sha,previousSHA=old['appSHA'],partitionSHA=release.PART_SHA,
            revision=(a.build.parent/'revision').read_text().strip(),blocks=len(rows),loads=len(loads),retained=len(regress),health=normal,screen=screen))
        print('QUALIFIED',a.sha,flush=True)
    except BaseException as exc:
        print('qualification failed',repr(exc),flush=True)
        try:
            if c.port.is_open:release.hold(c)
        except Exception as hold_error:print('recovery hold',hold_error,flush=True)
        flash('write_flash',a.previous,'rollback-app');flash('verify_flash',a.previous,'rollback-readback')
        c=connect();save(a.out/'rollback.json',dict(appSHA=old['appSHA'],health=health(c)));raise
    finally:c.close()
