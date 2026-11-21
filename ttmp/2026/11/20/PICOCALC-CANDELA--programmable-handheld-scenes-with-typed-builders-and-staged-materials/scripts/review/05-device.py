"""Verify the ordinary release identity, qualify all three sources and leave the verified playable image."""
import argparse, json, re, struct, sys, time, zlib
from functools import lru_cache
from pathlib import Path
from oracle import Graph, fixture, image

ticket=Path(__file__).resolve().parents[2]
ray=next(ticket.parent.glob('PICOCALC-RAYTRACE--*'))
sys.path.insert(0,str(ray/'scripts/device'))
from board_common import acquire, check_build, health, release, save

PREVIOUS='efc938724492f1de8f2a0911abd05d09e8692b80872f5da707da1f92dd08a0c9'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('operation',choices=['preflight','qualify'])
parser.add_argument('out',type=Path)
parser.add_argument('--candidate',type=Path)
parser.add_argument('--sha256')
parser.add_argument('--previous',type=Path,default=Path('/tmp/picocalc-raytrace-release/build'))
parser.add_argument('--port',default='/dev/ttyACM0')
a=parser.parse_args()
check_build(a.previous,PREVIOUS)
if a.operation=='qualify':
    check_build(a.candidate,a.sha256)
    assert a.sha256!=PREVIOUS

def crc(raw):return f'{zlib.crc32(raw):08x}'

def crop(raw):
    return b''.join(raw[2*((32+y)*320+40):2*((32+y)*320+280)] for y in range(240))

@lru_cache(maxsize=None)
def frame(which,weight,lx=31,ly=25):
    return image(Graph(fixture(('shared','tile')[which],weight)),(lx,ly))

def view(raw):
    return b''.join(raw[p:p+2] for y in range(240) for x in range(240) for p in [2*(160*(2*y//3)+2*x//3)])

def shot(c,label,expected,keys=()):
    for key in keys:
        c.command('key '+key);time.sleep(.32)
    for attempt in range(4):
        screen=c.shot(label,a.out);raw=crop((a.out/(label+'.rgb565')).read_bytes())
        if raw==expected:break
        time.sleep(.4)
    assert raw==expected,(label,crc(raw),crc(expected))
    return dict(label=label,viewCRC=crc(raw),pixels=57600,framebuffer=screen,pngSHA=release.sha(a.out/(label+'.png')))

def single(lines,prefix):
    hits=[json.loads(s[len(prefix):]) for s in lines if s.startswith(prefix)]
    assert len(hits)==1,(prefix,lines[-6:])
    return hits[0]

def check_graph(c,which,weight):
    cells=single(c.command('candela graph'),'CANGRAPH ')
    parsed=Graph(cells);control=Graph(fixture(('shared','tile')[which],weight))
    assert parsed.params==[weight] and len(parsed.spheres)==2
    for pos,want in zip(parsed.spheres,control.spheres,strict=True):assert pos[:4]==want[:4]
    if which==0:
        left=parsed.materials[parsed.spheres[0][4]];right=parsed.materials[parsed.spheres[1][4]]
        assert parsed.nodes[right][0]==3 and parsed.nodes[right][1]==left
    assert image(parsed)==frame(which,weight)
    return cells

def collect(c):
    loads=[];rows=[];graphs={}
    # Rotate the first stage across trials, and alternate first rendering arm across repeated measurements.
    for rep,stages in enumerate(((0,1,2),(1,2,0),(2,0,1))):
        for stage in stages:
            lines=c.command('candela stage '+str(stage),timeout=25)
            load=single(lines,'CANLOAD ')
            match=next((release.COMPILE.match(s) for s in lines if release.COMPILE.match(s)),None)
            assert match and match[1]=='candela' and match[3]=='ok' and load['stage']==stage and load['psramMonitored']
            loads.append(load|{'rep':rep,'quickjsPeak':int(match[5]),'compilerUs':int(match[4])})
            save(a.out/'loads.json',loads)
            for which,weights in enumerate(((0,128,256),(64,73,128))):
                for weight in weights:
                    for first in ((rep+which)%2,1-(rep+which)%2):
                        line=single(c.command(f'candela bench {which} {weight} {first}',timeout=20),'CANROW ')
                        assert (line['fixture'],line['weight'],line['rowFirst'])==(which,weight,first)
                        assert line['equal']==line['paramOnly']==1 and line['crc']==crc(frame(which,weight)),line
                        g=Graph(fixture(('shared','tile')[which],weight))
                        expected=[g.rgb(mat,x,y) for mat,x,y in [(g.spheres[0][4],60,61),(g.spheres[1][4],110,65),(g.floor,7,9)]]
                        assert line['rgbSamples']==[(r<<16)|(green<<8)|b for r,green,b in expected]
                        rows.append(line|{'stage':stage,'rep':rep})
                        save(a.out/'rows.json',rows)
                    if rep==0:
                        cells=check_graph(c,which,weight)
                        assert crc(struct.pack('<303H',*cells))==line['graphCRC']
                        graphs[f'{stage}/{which}/{weight}']=cells
                        save(a.out/'graphs.json',graphs)
            print('stage',rep,stage,load['compileUs'],'accepted',len(rows),flush=True)
    # Final interactive demonstration runs the normal final callback program.
    single(c.command('candela stage 2',timeout=25),'CANLOAD ')
    return loads,rows

a.out.mkdir(parents=True,exist_ok=False)
with acquire(),(a.out/'uart.log').open('wb',buffering=0) as log:
    def connect():return release.unit.Console(a.port,log)
    def esp(op,build,tag):release.esp(op,build,a.out,tag,a.port)
    c=connect()
    release.hold(c);esp('verify_flash',a.previous,'previous-readback')
    c=connect()
    prior_health=health(c)
    if a.operation=='preflight':
        c.command('key f1');time.sleep(.3);c.command('key v');time.sleep(.4)
        shots=[]
        for label,key in [('default',None),('sphere-right','right'),('light-up','w'),('reset','r')]:
            if key:c.command('key '+key);time.sleep(.35)
            info=c.shot(label,a.out)
            expected=next(r for r in json.loads((ray/'various/device/screens.json').read_text()) if r['label']==label)
            observed=crop((a.out/(label+'.rgb565')).read_bytes())
            assert crc(observed)==expected['actualCRC']
            shots.append({'label':label,'viewCRC':crc(observed),'historicalMatch':True,'shot':info})
        c.command('key f1');c.close()
        save(a.out/'preflight.json',dict(previousSHA=PREVIOUS,partitionSHA=release.PART_SHA,health=prior_health,shots=shots))
    else:
        release.hold(c)
        try:
            esp('write_flash',a.candidate,'new-app');esp('verify_flash',a.candidate,'candidate-readback')
            c=connect();health(c)
            loads,rows=collect(c)
            c.command('key f1');time.sleep(.35);c.command('key v');time.sleep(.4)
            screens=[]
            for label,keys,which,weight,lx,ly in [
                ('shared',('g',),0,128,31,25),('shared-edited',('right',),0,144,31,25),
                ('tiles',('g',),1,64,31,25),('tiles-edited',('right',),1,80,31,25),
                ('tiles-relit',('w',),1,80,31,17)]:
                screens.append(shot(c,label,view(frame(which,weight,lx,ly)),keys))
                save(a.out/'screens.json',screens)
            assert len(set(x['viewCRC'] for x in screens))==5
            c.command('key r');time.sleep(.4)
            c.shot('classic-reset',a.out)
            assert crc(crop((a.out/'classic-reset.rgb565').read_bytes()))=='4b91a3c8'
            c.command('key f1');time.sleep(.3)
            health(c);release.hold(c);esp('verify_flash',a.candidate,'final-readback')
            c=connect()
            save(a.out/'final.json',dict(qualified=True,appSHA=a.sha256,partitionSHA=release.PART_SHA,previousSHA=PREVIOUS,observations=len(rows),coldLoads=len(loads),finalHealth=health(c)))
            print('QUALIFIED',a.sha256,flush=True)
        except BaseException as exc:
            print('Qualification failed:',repr(exc),flush=True)
            try:
                if c.port.is_open:release.hold(c)
            except Exception as hold_error:print('recovery hold',hold_error,flush=True)
            esp('write_flash',a.previous,'rollback-app');esp('verify_flash',a.previous,'rollback-verify')
            c=connect();save(a.out/'rollback.json',dict(appSHA=PREVIOUS,health=health(c)))
            raise
        finally:c.close()
