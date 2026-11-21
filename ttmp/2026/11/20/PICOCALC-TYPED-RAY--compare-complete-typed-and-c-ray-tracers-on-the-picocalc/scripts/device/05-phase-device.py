"""Qualify the single diagnostic change against the full accepted renderer release."""
import argparse,importlib.util,json,sys,time,zlib
from pathlib import Path
ticket=Path(__file__).resolve().parents[2];ray=next(ticket.parent.glob('PICOCALC-RAYTRACE--*'))
sys.path.insert(0,str(ray/'scripts/device'))
from board_common import acquire,check_build,health,release,save
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('build',type=Path);parser.add_argument('sha');parser.add_argument('out',type=Path)
parser.add_argument('--previous',type=Path,default=Path('/tmp/picocalc-typed-ray-qualified-v1/build'))
parser.add_argument('--prior-run',type=Path,default=Path('/tmp/typed-ray-physical-1'))
parser.add_argument('--port',default='/dev/ttyACM0')
args=parser.parse_args()
prior=json.loads((args.prior_run/'final.json').read_text());assert prior['qualified']
check_build(args.previous,prior['appSHA']);check_build(args.build,args.sha);assert prior['appSHA']!=args.sha
spec=importlib.util.spec_from_file_location('physical_phases',ticket/'scripts/director/phase-check.py')
diagnostic=importlib.util.module_from_spec(spec);spec.loader.exec_module(diagnostic)
prior_rows=json.loads((args.prior_run/'rows.json').read_text())
a=args.out;a.mkdir(parents=True,exist_ok=False)
def record(c,cmd,tag):
    lines=c.command(cmd,timeout=25);matching=[json.loads(s[len(tag):]) for s in lines if s.startswith(tag)]
    assert len(matching)==1,(cmd,lines[-4:]);return matching[0]
def crop(x):return b''.join(x[2*((32+y)*320+40):2*((32+y)*320+280)] for y in range(240))
with acquire(),(a/'uart.log').open('wb',buffering=0) as log:
    def connect():return release.unit.Console(args.port,log)
    def esp(op,build,tag):release.esp(op,build,a,tag,args.port)
    c=connect();release.hold(c);esp('verify_flash',args.previous,'previous-readback')
    c=connect();health(c);release.hold(c)
    try:
        esp('write_flash',args.build,'candidate-app');esp('verify_flash',args.build,'candidate-readback')
        c=connect();health(c)
        results=diagnostic.collect(c,a)
        if results is not None:save(a/'diagnostic.json',results)
        # The revised material slot also exposes the original complete-frame control.
        prior_material=json.loads((args.prior_run/'materials.json').read_text())
        controls={(r['fixture'],r['weight']):r['crc'] for r in prior_material}
        regress=[]
        for (fixture,weight),crc in controls.items():
            r=record(c,f'typedmat bench {fixture} {weight} 0','TRMAT ')
            assert r['equal'] and r['crc']==crc
            regress.append(r);save(a/'material-regression.json',regress)
        c.command('typedmat drop')
        rows=[]
        for prog in prior['programs']:
            load=record(c,'typedray load '+str(prog),'TRLOAD ');assert load['program']==prog
            row=record(c,'typedray bench 68 61 31 25 160 0','TRROW ')
            want=next(r for r in prior_rows if r['fixture']=='default' and r['program']==prog)
            assert row['program']==prog and row['crc']==want['crc']
            rows.append(row);save(a/'fixed-regression.json',rows)
        record(c,'typedray load 0','TRLOAD ');health(c);release.hold(c)
        esp('verify_flash',args.build,'final-readback');c=connect();normal=health(c)
        for key in ['f1','v','g','g','g']:c.command('key '+key);time.sleep(.4)
        status=record(c,'typedray status','TRSTATUS ');assert status['program']==0 and status['frames']>0 and status['pose']==[68,61,31,25]
        shot=c.shot('handoff',a)
        viewport=crop((a/'handoff.rgb565').read_bytes());reference=crop((args.prior_run/'handoff.rgb565').read_bytes())
        assert viewport==reference and f'{zlib.crc32(viewport):08x}'=='4b91a3c8'
        save(a/'final.json',dict(qualified=True,appSHA=args.sha,previousSHA=prior['appSHA'],partitionSHA=release.PART_SHA,
            revision=(args.build.parent/'revision').read_text().strip(),fixedChecks=len(rows),health=normal,liveScreen=shot,typedState=status))
        print('QUALIFIED',args.sha,flush=True)
    except BaseException as exc:
        print('phase qualification failed',repr(exc),flush=True)
        try:
            if c.port.is_open:release.hold(c)
        except Exception as e:print('recovery hold',e,flush=True)
        esp('write_flash',args.previous,'rollback-app');esp('verify_flash',args.previous,'rollback-readback')
        c=connect();save(a/'rollback.json',dict(appSHA=prior['appSHA'],health=health(c)));raise
    finally:c.close()
