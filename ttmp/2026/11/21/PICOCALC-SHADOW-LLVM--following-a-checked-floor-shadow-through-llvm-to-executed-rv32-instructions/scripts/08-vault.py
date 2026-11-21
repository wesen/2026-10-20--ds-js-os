"""Prepare the student article and portable REPL inputs under a vault (or staging) root."""
import json,re,subprocess,sys,zipfile
from io import BytesIO
from pathlib import Path
t=Path(__file__).resolve().parents[1];repo=t.parents[4]
vault=Path(sys.argv[1])/'Projects/2026/11/21';vault.mkdir(parents=True,exist_ok=True)
p=next((t/'analysis').glob('01-*'));rel=p.relative_to(repo)
revision=subprocess.check_output(['git','log','-1','--format=%H','--',str(rel)],cwd=repo,text=True).strip()
assert revision and subprocess.check_output(['git','show',revision+':'+str(rel)],cwd=repo)==p.read_bytes()
def put(p,data):
 if p.exists() and p.read_bytes()!=data:raise ValueError('existing publication differs: '+str(p))
 p.parent.mkdir(exist_ok=True,parents=True);p.write_bytes(data)
body=p.read_text().split('\n---\n',1)[1].strip()
def links(m):
 s=m[1]
 if s.startswith(('http:','https:')):return m[0]
 filename,sep,anchor=s.partition('#');dest=(p.parent/filename).resolve()
 assert dest.is_file(),dest
 if anchor.startswith('L') and anchor[1:].isdigit():return '](<'+str(dest)+':'+anchor[1:]+'>)'
 return '](<'+str(dest)+(sep+anchor if sep else '')+'>)'
body=re.sub(r'\]\(([^)\n]+)\)',links,body)
assets='_assets/shadow-llvm/checked-shadow-repl.zip'
note='ARTICLE - PicoCalc Shadows - Following a Checked Buffer Read from LLVM IR to the PicoCalc.md'
front=['---','title: Following a checked buffer read from LLVM IR to the PicoCalc','created: 2026-11-21','type: article','tags: [project, picocalc, compiler, llvm, performance]','source_revision: '+revision,'ticket: PICOCALC-SHADOW-LLVM','---','']
body+='\n\n## Portable REPL capture\n\nThe [archive]('+assets+') contains the verified LLVM pass streams, current kernel profiles, physical measurements, saved answers and runnable JS. Unzip it, serve its extracted root with the repository’s trace-repl binary on 127.0.0.1:3795, then run its scripts/06-repl.py. The saved various/repl.json can also be read directly.\n'
buf=BytesIO()
with zipfile.ZipFile(buf,'w') as z:
 files=[*sorted((t/'various/llvm-pipeline').iterdir()),t/'various/native/pcs.json',t/'various/device/rows.json',t/'various/device/receipt.json',t/'various/repl.json',t/'scripts/05-cells.js',t/'scripts/06-repl.py']
 for f in files:
  entry=zipfile.ZipInfo(str(f.relative_to(t)),(2026,11,21,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(entry,f.read_bytes())
put(vault/assets,buf.getvalue());put(vault/note,('\n'.join(front)+'\n'+body).encode())
