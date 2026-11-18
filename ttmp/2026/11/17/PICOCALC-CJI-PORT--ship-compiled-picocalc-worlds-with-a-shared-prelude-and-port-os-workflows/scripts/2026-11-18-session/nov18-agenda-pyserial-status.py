import os,signal,select,time,re
from pathlib import Path
pid=3768454
if not Path(f'/proc/{pid}').exists():
 print(Path('/tmp/nov18-agenda.jsonl').read_text());exit()
assert b'07-check-bundled-catalog.py' in Path(f'/proc/{pid}/cmdline').read_bytes()
os.kill(pid,signal.SIGSTOP)
try:
 for _ in range(25):
  if re.search(r'State:\s*T',Path(f'/proc/{pid}/status').read_text()):break
  time.sleep(.04)
 else:raise RuntimeError('reader still active')
 import serial
 conn=serial.Serial('/dev/ttyACM0',115200,timeout=.25)
 fd=conn.fileno()
 try:
  data=b'';end=time.monotonic()+18;next_ping=0
  while time.monotonic()<end:
   if time.monotonic()>next_ping:
    os.write(fd,b'\ncji\n');next_ping=time.monotonic()+4
   if select.select([fd],[],[],1)[0]:data+=os.read(fd,4096)
   if b'cji: busy' in data or b'BUNDLED.js' in data:
    time.sleep(.15)
    if select.select([fd],[],[],0)[0]:data+=os.read(fd,4096)
    break
  lines=re.findall(rb'(?:cji: [^\r\n]+|cji build PATH[^\r\n]+)',data)
  print(len(data),'bytes read',lines)
  with open('/tmp/nov18-agenda-live-status.log','ab') as f:f.write(b'\n'.join(lines)+b'\n')
 finally:conn.close()
finally:
 os.kill(pid,signal.SIGCONT)
