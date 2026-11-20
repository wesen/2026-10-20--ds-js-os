"""Own one serial window; verify the playable app, run fixed experiments, restore and verify it."""
import argparse, fcntl, hashlib, json, os, signal, subprocess, sys, time
from pathlib import Path
import serial
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('scratch',type=Path);p.add_argument('--preflight',action='store_true');p.add_argument('--port',default='/dev/ttyACM0')
p.add_argument('--native-producer',action='store_true',help='matched native producer, admission and indexed reading');p.add_argument('--binary',action='store_true',help='indexed binary study without any installation file writes');p.add_argument('--latency',action='store_true',help='independent replay and interactive installation follow-up');p.add_argument('--original',type=Path,default=Path('/tmp/p4-system-fix-final/build'))
p.add_argument('--candidate',type=Path,default=Path('/tmp/pico-render-study-board/build'))
p.add_argument('--esptool',default='/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py')
args=p.parse_args(); out=args.scratch;out.mkdir(exist_ok=True,parents=True)
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
orig=args.original/'picocalc-os-p4.bin';image=args.candidate/'picocalc-os-p4.bin'
assert sha(orig)=='f12e2f5d6e668ef7d61fa456b69b56bf9f1e976e929672e7df81ac33a2f03f83'
lock=open('/tmp/pico-lab2-wave/original/serial.lock','a')
fcntl.flock(lock,fcntl.LOCK_EX)
def console(cmd,timeout=6):
    with serial.Serial(args.port,115200,timeout=.05) as ser:
        ser.reset_input_buffer();ser.write(('\n'+cmd+'\n').encode())
        buf=b''; stop=time.monotonic()+timeout
        while time.monotonic()<stop:
            buf+=ser.read(4096)
            if ('#OK '+cmd.split()[0]+'\n').encode() in buf.replace(b'\r',b''):break
        value=buf.decode(errors='replace').replace('\r','')
        if '#OK '+cmd.split()[0] not in value:raise RuntimeError('no ack for '+cmd+' '+value[-180:])
        return value
def wait_console():
    for _ in range(6):
        try:
            log=console('worlds',8)
            apps=next(json.loads(l) for l in log.splitlines() if l.startswith('[{"name":'))
            engines={w['name']:[w['engine'],w['last_error']] for w in apps}
            if all(k in engines and not engines[k][1] for k in ['compositor','chess','editor','snake','sysmon']):return engines
        except (RuntimeError,StopIteration,ValueError,serial.SerialException):pass
        time.sleep(2)
    raise RuntimeError('playable world query failed')
def hold():
    assert 'i2c0 held between transactions' in console('hold',10)
def esp(label,*cmd):
    with (out/(label+'.log')).open('wb') as f:
        subprocess.run([args.esptool,'--chip','esp32p4','-p',args.port,'-b','921600',*map(str,cmd)],stdout=f,stderr=subprocess.STDOUT,check=True,timeout=230)
def verify(label,app):
    hold();esp(label,'verify_flash','0x10000',app,'0x8000',args.original/'partition_table/partition-table.bin')
def dump(name,obj): (out/name).write_text(json.dumps(obj,indent=2)+'\n')
verify('original-verify',orig)
start_worlds=wait_console()
if args.preflight:
    dump('preflight.json',{'firmwareSha256':sha(orig),'worlds':start_worlds,'esptool':'verify_flash app and partition table'});sys.exit(0)
assert image.stat().st_size<8*1024*1024 and (args.original/'partition_table/partition-table.bin').read_bytes()==(args.candidate/'partition_table/partition-table.bin').read_bytes()
info={'firmwareSha256':sha(orig),'experimentSha256':sha(image),'startWorlds':start_worlds,'runs':[],'failures':[]}
def record(): dump('physical.json',info)
def interrupted(sig,frame):raise KeyboardInterrupt(sig)
signal.signal(signal.SIGTERM,interrupted)
def trial(name,arm,n,block):
    cmd=f'renderlab {name} {arm} {n}'; log=console(cmd,35)
    lines=[l for l in log.splitlines() if l.startswith('LAB ')]
    try:
        l=next(s for s in lines if '{' in s and 'ERROR' not in s)
        info['runs'].append({'block':block,'name':name,'arm':arm,'reps':n,'data':json.loads(l[l.index('{'):])})
    except (ValueError,StopIteration):
        info['failures'].append([block,cmd,lines])
    record()
def key(k):console('key '+k);time.sleep(.35)
wrote=False;own_files=False
try:
    hold();wrote=True;esp('install','write_flash','0x10000',image)
    info['experimentWorlds']=wait_console();record()
    if not (args.binary or args.native_producer):
        base='rlab1120'
        if 'no directory '+base not in console('ls '+base): raise RuntimeError('fixture directory already exists')
        own_files=True
        for suffix in ['wasm','typed']:
            f=Path('/tmp/pico-render-study-board/tree/picocalc-os/port/esp32p4/main')/('study_view.'+suffix)
            t=time.monotonic()
            subprocess.run([sys.executable,'picocalc-os/tools/p4put.py',str(f),base+'/view.'+suffix,'-p',args.port],check=True,timeout=90)
            info.setdefault('serialUploadMs',{})[suffix]=(time.monotonic()-t)*1000
    if args.native_producer:
        names=['sysmon','snake','chess','editor']
        for b in range(7):
            for n,app in enumerate(names[b%4:]+names[:b%4]):
                arms=['G','B'] if (b+n)%2==0 else ['B','G']
                for arm in arms:trial('nativeprod',app+'-'+arm,8,b)
    elif args.binary:
        names=['sysmon','chess','snake','editor']
        for b in range(7):
            for n,app in enumerate(names[b%4:]+names[:b%4]):
                arms=['G','B','P']
                off=(b+n)%3
                for arm in arms[off:]+arms[:off]:trial('binary',app+'-'+arm,1,b)
                native=['G','B'] if (b+n)%2==0 else ['B','G']
                for arm in native:trial('nativebin',app+'-'+arm,8,b)
    elif args.latency:
        key('f1')
        def latency(arm):
            # Send from a single serial producer. Timestamp when the independent key line is sent,
            # stop once its console acknowledgement arrives. The earlier job's output is a separate line.
            with serial.Serial(args.port,115200,timeout=.003) as ser:
                ser.reset_input_buffer()
                if arm!='idle': ser.write(('\nrenderlab install '+arm+' 1\n').encode());ser.flush()
                time.sleep(.003)
                at=time.monotonic_ns();ser.write(b'\nkey f1\n');ser.flush()
                received=b''
                while time.monotonic_ns()-at<4_000_000_000 and b'#OK key' not in received:
                    received+=ser.read(128)
                dt=(time.monotonic_ns()-at)/1e6
                assert b'#OK key' in received
                stage=None
                if arm!='idle':
                    lines=received.decode(errors='replace').splitlines()
                    line=next(l for l in lines if l.startswith('LAB VIEW '))
                    stage=json.loads(line[line.index('{'):]);assert stage['frames']==1
                return dict(arm=arm,hostAckMs=dt,stage=stage)
        for b in range(5):
            order=['idle','resident','module','source'];order=order[b%4:]+order[:b%4]
            for arm in order:
                info.setdefault('keyAdmission',[]).append(latency(arm));record();time.sleep(.32)
        for name,arms,n in [('sysmon',['M','G'],1),('snake',['SJ','J'],2),('producer',['semantic','generic'],4),
                            ('reader',['chess-index','chess-native'],2)]:
            for arm in arms:trial(name,arm,n,5)
    else:
        for app,shortcut,move in [('sysmon','m','down'),('chess','h','left'),('snake','s','p'),('editor','e','f6')]:
            key('f1');key(shortcut);time.sleep(.8); console('renderlab trace start')
            key(move);time.sleep(.3)
            lines=console('renderlab trace stop').splitlines()
            dump('trace-'+app+'.json',[l for l in lines if l.startswith('LAB TRACE')])
            raw=console('renderlab capture '+app)
            for l in raw.splitlines():
                if l.startswith('LAB FRAME '):dump('frame-'+app+'.json',json.loads(l.split(' ',3)[3]))
        key('f1')
        for b in range(5):
            groups=[('snake',['J','SJ','T'],2),('sysmon',['G','M','A'],1),('view',['resident','module','source'],1),
                    ('chess',['generic','semantic'],4),('producer',['generic','semantic'],4)]
            for name,arms,n in groups:
                j=b%len(arms);ordered=arms[j:]+arms[:j]
                if b%2:ordered.reverse()
                for arm in ordered:trial(name,arm,n,b)
            for app in ['sysmon','snake','chess']:
                arms=['native','index','both','key','sparse']
                j=b%len(arms)
                for arm in arms[j:]+arms[:j]:trial('reader',app+'-'+arm,2,b)
    record()
finally:
    if wrote:
        if own_files:
            try:console('renderlab cleanup fixtures')
            except RuntimeError:pass
        # A rebooted exception image can still accept the hold command once settled.
        wait_console();hold();esp('restore','write_flash','0x10000',orig)
        wait_console();verify('restore-verify',orig)
        info['restoredWorlds']=wait_console();info['restored']=True;record()
