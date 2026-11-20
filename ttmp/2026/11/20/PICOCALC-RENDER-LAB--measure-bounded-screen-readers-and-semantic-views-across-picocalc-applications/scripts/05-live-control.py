"""Capture behavior of the installed playable firmware, no resets or firmware changes."""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('scratch', type=Path)
p.add_argument('receipt', type=Path)
p.add_argument('--port', default='/dev/ttyACM0')
a=p.parse_args()
a.scratch.mkdir(parents=True, exist_ok=False)
names={'snake','sysmon','chess','compositor','display','keyboard'}
# Allow the display transfer and base64 framebuffer report to finish before requesting another one.
commands=[('1','worlds'),('2','key f1'),('3','key s'),('4','key f2'),('5','key p'),('7','shot'),('21','worlds'),
          ('22','key f1'),('23','key m'),('25','key down'),('27','shot'),('42','worlds'),('43','key f1'),
          ('44','key h'),('46','key f2'),('47','key enter'),('49','shot'),('65','worlds'),('66','key f1')]
cli=[sys.executable,'picocalc-os/tools/p4cap.py','--no-reset','-p',a.port,'-s','69','--shot-dir',str(a.scratch)]
for at,cmd in commands: cli+=['-c',at+' '+cmd]
with (a.scratch/'stdout').open('wb') as out,(a.scratch/'stderr').open('wb') as err:
    subprocess.run(cli,stdout=out,stderr=err,check=True)
rows=[]
for line in (a.scratch/'stdout').read_text(errors='replace').splitlines():
    if line.startswith('[{"name"'):
        try: worlds=json.loads(line)
        except ValueError: continue
        rows.append({w['name']:{k:w[k] for k in ('engine','turns','cpu_ms','msgs','restarts','last_error')} for w in worlds if w['name'] in names})
shots={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(a.scratch.glob('shot-*.png'))}
result={'commands':commands,'duration_s':69,'worlds':rows,'pngSha256':shots,
        'captureDiagnostics':(a.scratch/'stderr').read_text(errors='replace').splitlines()[-12:]}
a.receipt.write_text(json.dumps(result,indent=2)+'\n')
if len(rows)!=4 or len(shots)!=3: sys.exit('incomplete device controls; inspect captured receipt')
for n in names:
    if rows[-1][n]['restarts']!=rows[0][n]['restarts'] or rows[-1][n]['last_error']:
        sys.exit('world restart/error detected: '+n)
