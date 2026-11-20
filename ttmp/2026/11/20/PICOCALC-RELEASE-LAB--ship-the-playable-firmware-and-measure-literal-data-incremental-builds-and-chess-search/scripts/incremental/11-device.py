"""Run under the shared PicoCalc serial lock, then restore the published playable app with readback."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import time

import serial

here=Path(__file__).resolve().parent
day=here.parents[2]
module=next(day.glob('PICOCALC-SNAKE-INTEGRATION--*/scripts/device/01-normal-snake.py'))
spec=importlib.util.spec_from_file_location('console',module)
console=importlib.util.module_from_spec(spec)
spec.loader.exec_module(console)
release_hash='134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1'
partition_hash='72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main(a):
    app=a.build/'incremental_build_trial.bin'
    image=a.release/'picocalc-os-p4.bin'
    partition=a.release/'partition_table/partition-table.bin'
    assert digest(image)==release_hash and digest(partition)==partition_hash
    assert (a.build/'partition_table/partition-table.bin').read_bytes()==partition.read_bytes()
    assert 0<app.stat().st_size<8*1024*1024
    gold=json.loads(a.gold.read_text())
    if a.preflight: print('preflight pass',digest(app));return
    a.out.mkdir(parents=True,exist_ok=False)
    receipt={'release':release_hash,'partition':partition_hash,'candidate':digest(app),'cold':[],'rows':[],'memory':{}}
    def save():(a.out/'physical.json').write_text(json.dumps(receipt,indent=2)+'\n')
    def flash(op,p,tag):
        args=[a.esptool,'--chip','esp32p4','-p',a.port,'-b','921600','--after',
              'no_reset' if op=='write_flash' else 'hard_reset',op,'0x10000',str(p)]
        if op=='verify_flash':args+=['0x8000',str(partition)]
        with (a.out/(tag+'.log')).open('wb') as f:subprocess.run(args,stdout=f,stderr=subprocess.STDOUT,timeout=210,check=True)
    with console.LOCK.open('a') as lock,(a.out/'uart.log').open('wb',buffering=0) as log:
        fcntl.flock(lock,fcntl.LOCK_EX)
        def hold():
            c=console.Console(a.port,log)
            try:assert any('held between transactions' in line for line in c.command('hold',timeout=16))
            finally:c.close()
        hold();flash('verify_flash',image,'release-before');hold()
        try:
            flash('write_flash',app,'trial-write');flash('verify_flash',app,'trial-verify')
            with serial.Serial(a.port,115200,timeout=.3) as device:
                deadline=time.monotonic()+540
                while time.monotonic()<deadline:
                    raw=device.readline();log.write(raw);s=raw.decode(errors='replace').strip()
                    if s.startswith('INC_'):print(s,flush=True)
                    if s.startswith('INC_ROW '):receipt['rows'].append(json.loads(s[8:]));save()
                    elif s.startswith('INC_COLD '):
                        _,name,arm,us,peak,crc=s.split()
                        assert int(crc)==gold[name]['base']
                        receipt['cold'].append({'app':name,'arm':arm,'us':int(us),'peakBytes':int(peak),'crc':int(crc)});save()
                    elif s.startswith('INC_MEM '):
                        _,name,amount=s.split();receipt['memory'][name]=int(amount)
                    elif 'Guru Meditation Error' in s or s.startswith(('INC_ERROR','INC_DONE FAIL','INC_DONE ALLOCATION_FAILED','assert failed:')):raise RuntimeError(s)
                    elif s=='INC_DONE ok':break
                else:raise TimeoutError('incremental trial never finished')
            assert len(receipt['cold'])==4 and len(receipt['rows'])==44
            for row in receipt['rows']:
                if 'crc' in row:assert row['crc']==gold[row['app']][row['key']]
            receipt['qualified']=True;save()
        finally:
            flash('write_flash',image,'release-restore');flash('verify_flash',image,'release-restore-verified')
            receipt['restoredReadback']=True;save()
            c=console.Console(a.port,log)
            try:
                receipt['restoredWorlds']=sorted(c.health())
                deadline=time.monotonic()+20
                while True:
                    s=next(json.loads(line) for line in c.command('painter') if line.startswith('{"sources"'))
                    if s['installed'] and not s['rejects']:break
                    if time.monotonic()>deadline:raise RuntimeError(s)
                    time.sleep(.25)
                receipt['restoredPainter']=s
            finally:c.close();save()
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('build','release','gold','out'):p.add_argument(arg,type=Path)
    p.add_argument('--preflight',action='store_true')
    p.add_argument('--port',default='/dev/ttyACM0')
    p.add_argument('--esptool',default='/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py')
    def stop(*_): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop)
    main(p.parse_args())
