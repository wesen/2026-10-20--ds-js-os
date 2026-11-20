"""Run the fixed screen-encoder trial, then restore and verify the qualified playable image."""
import argparse, fcntl, hashlib, json, signal, subprocess, time
from pathlib import Path
import serial
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('build',type=Path)
p.add_argument('output',type=Path)
p.add_argument('--original',type=Path,default=Path('/tmp/p4-system-fix-final/build'))
p.add_argument('--port',default='/dev/ttyACM0')
p.add_argument('--preflight',action='store_true')
p.add_argument('--followup',action='store_true')
a=p.parse_args()
a.output.mkdir(exist_ok=True,parents=True)
orig=a.original/'picocalc-os-p4.bin'; image=a.build/'picocalc-os-p4.bin'
part=a.original/'partition_table/partition-table.bin'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert digest(orig)=='f12e2f5d6e668ef7d61fa456b69b56bf9f1e976e929672e7df81ac33a2f03f83'
lock=Path('/tmp/pico-lab2-wave/original/serial.lock')
lock.parent.mkdir(exist_ok=True,parents=True)
owner=lock.open('a')
fcntl.flock(owner,fcntl.LOCK_EX)
def esp(label,cmd,file,verify=False):
    args=['/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py','--chip','esp32p4','-p',a.port,'-b','921600',cmd,'0x10000',str(file)]
    if verify:args+=['0x8000',str(part)]
    with (a.output/(label+'.txt')).open('wb') as log:
        subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=160)
def console(command,limit=12):
    with serial.Serial(a.port,115200,timeout=.04) as port:
        port.reset_input_buffer()
        port.write(('\n'+command+'\n').encode())
        text=b''; until=time.monotonic()+limit
        ack=('#OK '+command.split()[0]+'\n').encode()
        while time.monotonic()<until:
            text+=port.read(4096)
            if ack in text.replace(b'\r',b''):return text.decode(errors='replace').replace('\r','')
        raise RuntimeError(('console timeout',command,text[-1000:]))
def health():
    for _ in range(8):
        try:
            lines=console('worlds',5).splitlines()
            worlds=next(json.loads(s) for s in lines if s.startswith('[{"name":'))
            selected={w['name']:[w['engine'],w['last_error']] for w in worlds if w['name'] in ('sysmon','compositor','snake','editor','chess')}
            if len(selected)==5 and all(not pair[1] for pair in selected.values()):return selected
        except (RuntimeError,StopIteration,ValueError,OSError):pass
        time.sleep(.5)
    raise RuntimeError('five healthy worlds unavailable')
def hold():
    assert 'i2c0 held between transactions' in console('hold',10)
def write(data):
    path=a.output/'physical.json'
    path.write_text(json.dumps(data,indent=2)+'\n')
def interrupt(*args):raise KeyboardInterrupt()
signal.signal(signal.SIGTERM,interrupt)
r={'playable':digest(orig),'before':health(),'rows':[]}
hold();esp('baseline','verify_flash',orig,True)
r['baselineVerified']=True
if a.preflight: write(r);raise SystemExit(0)
assert (a.build/'partition_table/partition-table.bin').read_bytes()==part.read_bytes()
assert image.stat().st_size<8*1024*1024
r['candidate']=digest(image)
wrote=False
try:
    health();hold();wrote=True;esp('candidate','write_flash',image)
    r['during']=health()
    if a.followup:
        arms=['pG','pN','pT','pR','pF']
        for block in range(10):
            order=arms[block%5:]+arms[:block%5]
            if block>=5:order=list(reversed(order))
            secondary=['cT','cF','sT','sF']
            if block%2:secondary.reverse()
            for arm in ['install','prebuilt','tableload',*order,*secondary]:
                resp=console('psixstudy '+arm+' 1',22)
                lines=[s for s in resp.splitlines() if s.startswith(('STAGE','stage compile'))]
                if any('ERROR' in s or 'failed' in s for s in lines):raise RuntimeError(lines)
                row=next(json.loads(s[11:]) for s in lines if s.startswith('STAGE DATA '))
                assert row['arm']==arm
                if arm in arms: assert row['count']==47
                if arm in secondary: assert row['count']==(24 if arm[0]=='c' else 20)
                r['rows'].append({'block':block,**row});write(r)
    else:
        for block in range(7):
            runs=['install','N','T','G'] if block%3==0 else ['install','T','G','N'] if block%3==1 else ['install','G','N','T']
            for arm in runs:
                resp=console('psixstudy '+arm+(' 1' if arm=='install' else ' 4'),24)
                lines=[s for s in resp.splitlines() if s.startswith(('STAGE','stage compile'))]
                if any('ERROR' in s or 'failed' in s for s in lines):raise RuntimeError(lines)
                row=next(json.loads(s[11:]) for s in lines if s.startswith('STAGE DATA '))
                assert row['arm']==arm and (arm=='install' or row['count']==188)
                r['rows'].append({'block':block,**row})
                if arm=='install':r.setdefault('compilerLogs',[]).extend(s for s in lines if s.startswith('stage compile'))
                write(r)
        expected={'system':(9,15074,'3e515422'),'keys':(6,5797,'98452397')}
        for block in range(5):
            apps=['system','keys'] if block%2==0 else ['keys','system']
            policies=['generic','trained','online','warm']
            policies=policies[block%4:]+policies[:block%4]
            if block==0: policies=['verify',*policies]
            for app in apps:
                for policy in policies:
                    arm=policy+'-'+app
                    resp=console('psixstudy '+arm+' 1',18)
                    lines=[s for s in resp.splitlines() if s.startswith('STAGE ')]
                    if any('ERROR' in s for s in lines): raise RuntimeError(lines)
                    row=next(json.loads(s[11:]) for s in lines if s.startswith('STAGE DATA '))
                    assert (row['count'],row['bytes'],row['wireHash'])==expected[app] and row['arm']==arm
                    if policy=='verify': assert row['verified']==3
                    r.setdefault('adaptive',[]).append({'block':block,**row});write(r)
except BaseException as e:
    r['error']=repr(e);write(r);raise
finally:
    if wrote:
        try:hold()
        except (OSError,RuntimeError,AssertionError):pass  # A stopped test firmware can still enter the ROM bootloader.
        esp('restore','write_flash',orig)
        health();hold();esp('restore-verify','verify_flash',orig,True)
        r['after']=health();r['restored']=True;write(r)
