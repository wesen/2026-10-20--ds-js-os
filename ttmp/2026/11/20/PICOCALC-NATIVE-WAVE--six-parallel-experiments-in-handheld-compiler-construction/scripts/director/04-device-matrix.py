"""Time all compiled arms in one physical run, verify the baseline, then restore the same release."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import signal
import statistics
import subprocess
import time

import serial

day=Path(__file__).resolve().parents[3]
helpers=next(day.glob("PICOCALC-SNAKE-INTEGRATION--*/scripts/device/01-normal-snake.py"))
spec=importlib.util.spec_from_file_location("console_helpers",helpers)
shared=importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
release_receipt=json.loads(next(day.glob("PICOCALC-RELEASE-LAB--*/various/release.json")).read_text())
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ['work','release','output']:
        parser.add_argument(key,type=Path)
    parser.add_argument('--port',default='/dev/ttyACM0')
    parser.add_argument('--esptool',type=Path,default=Path('/home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py'))
    args=parser.parse_args()
    app=args.release/'picocalc-os-p4.bin'
    partition=args.release/'partition-table.bin'
    candidate=args.work/'build/heldout_wave.bin'
    assert digest(app)==release_receipt['application']['sha256']
    assert digest(partition)==release_receipt['partition']['sha256']
    assert digest(args.work/'build/partition_table/partition-table.bin')==digest(partition)
    assert 0<candidate.stat().st_size<0x800000
    inputs=json.loads((args.work/'main/inputs.json').read_text())
    for i,arm in enumerate(inputs['arms'][:-1]):
        assert digest(args.work/f'main/arm{i}.bin')==arm['imageSHA256']
    args.output.mkdir(exist_ok=False,parents=True)
    receipt={'inputs':inputs,'candidateSHA256':digest(candidate),'ordinarySHA256':digest(app),
             'partitionSHA256':digest(partition),'runs':[]}
    def record():
        (args.output/'physical.json').write_text(json.dumps(receipt,indent=2)+'\n')
    def flash(verb,image,label):
        cmd=[str(args.esptool),'--chip','esp32p4','-p',args.port,'-b','921600',
             '--after','no_reset' if verb=='write_flash' else 'hard_reset',verb,'0x10000',str(image)]
        if verb=='verify_flash':cmd+=['0x8000',str(partition)]
        with (args.output/(label+'.log')).open('wb') as f:
            subprocess.run(cmd,check=True,timeout=180,stdout=f,stderr=subprocess.STDOUT)
    def interrupt(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM,interrupt)
    with shared.LOCK.open('a') as guard,(args.output/'uart.log').open('wb',buffering=0) as log:
        fcntl.flock(guard,fcntl.LOCK_EX)
        def hold():
            con=shared.Console(args.port,log)
            try:
                assert any('held between transactions' in x for x in con.command('hold',timeout=16))
            finally:
                con.close()
        hold()
        flash('verify_flash',app,'before')
        hold()
        try:
            flash('write_flash',candidate,'probe-write')
            flash('verify_flash',candidate,'probe-verify')
            until=time.monotonic()+150
            with serial.Serial(args.port,115200,timeout=.3) as dev:
                while time.monotonic()<until:
                    raw=dev.readline()
                    log.write(raw)
                    text=raw.decode(errors='replace').strip()
                    if text.startswith('WAVE_BEGIN '):
                        receipt['config']={k:int(v) for k,v in (x.split('=') for x in text.split()[1:])}
                    elif text.startswith('WAVE_ROW '):
                        b,e,a,us,value=map(int,text.split()[1:])
                        assert us>0
                        receipt['runs'].append({'block':b,'endpoint':e,'arm':a,'us':us,'sum':value})
                    elif text.startswith('WAVE_FAIL'):
                        raise RuntimeError(text)
                    elif text=='WAVE_DONE ok':
                        break
                else: raise TimeoutError('no completed held-out benchmark')
            cfg=receipt['config']
            assert cfg['hz']==360000000 and cfg['arms']==len(inputs['arms'])
            rows=receipt['runs']
            expect={(b,e,a) for b in range(cfg['blocks']) for e in range(3) for a in range(cfg['arms'])}
            assert len(rows)==len(expect) and {(r['block'],r['endpoint'],r['arm']) for r in rows}==expect
            assert all(len({r['sum'] for r in rows if r['endpoint']==e})==1 for e in range(3))
            receipt['qualified']=True
            record()
        finally:
            flash('write_flash',app,'ordinary-write')
            flash('verify_flash',app,'ordinary-verify')
            receipt['restoredReadback']=True
            record()
            con=shared.Console(args.port,log)
            try:
                worlds=con.health()
                receipt['healthyNativeWorlds']=sorted(set(shared.NATIVE).intersection(worlds))
                deadline=time.monotonic()+20
                while True:
                    painter=next(json.loads(s) for s in con.command('painter') if s.startswith('{"sources"'))
                    if painter['installed'] and not painter['rejects']:break
                    if time.monotonic()>deadline:raise RuntimeError(painter)
                    time.sleep(.35)
                receipt['restoredPainter']=painter
            finally:
                con.close()
                record()
if __name__=='__main__':
    main()
