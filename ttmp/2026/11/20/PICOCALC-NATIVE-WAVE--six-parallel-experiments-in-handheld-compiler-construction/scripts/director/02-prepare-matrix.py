"""Generate an isolated ESP-IDF app comparing already compiled native arms on identical input."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil

here = Path(__file__).resolve().parent
ticket = here.parents[1]
root = next(p for p in here.parents if (p / ".git").exists())
arg=argparse.ArgumentParser(description=__doc__)
arg.add_argument("work",type=Path)
arg.add_argument("corpus",type=Path)
arg.add_argument("arms",type=Path,nargs="+",help="Paths to JSON arm descriptors with matching .bin files")
args=arg.parse_args()
assert not args.work.resolve().is_relative_to(root)
main=args.work/'main'
shutil.copytree(here/'board',args.work,dirs_exist_ok=True)
previous=next(ticket.parent.glob('PICOCALC-RELEASE-LAB--*'))
shutil.copy(previous/'scripts/chess/board/sdkconfig.defaults',args.work)
shutil.copy(root/'picocalc-os/port/esp32p4/partitions.csv',args.work)
lock=json.loads((ticket/'various/director/heldout-lock.json').read_text())
def sha(data):
    return hashlib.sha256(data).hexdigest()
def locked(name):
    raw=(args.corpus/name).read_bytes()
    assert sha(raw)==lock['files'][name], name
    return raw
source_hash=sha(locked('burst.typed'))
texts=json.loads(locked('manifest-input.json'))['inputs']
def units(s):
    data=s.encode('utf-16-le',errors='surrogatepass')
    return [int.from_bytes(data[i:i+2],'little') for i in range(0,len(data),2)]
def c_text(s):
    u=units(s)
    assert len(u)<=128
    return '{'+str(len(u))+', {'+(','.join(map(str,u)) or '0')+'}}'
def expected(s):
    if not re.fullmatch('[0-9;]*',s):
        return -2
    total=0
    for field in s.split(';'):
        if field:
            total=(total*13+3*(int(field)%4093)+7)%4093
    return total
labels=["No events in this window","One event in this window","Two or more events in this window"]
decl=['static const text input[]={'+','.join(map(c_text,texts))+'};',
      'static const text labels[]={'+','.join(map(c_text,labels))+'};']
def int_array(name, values):
    return 'static const int '+name+'[]={'+','.join(map(str,values))+'};'
parsed=[expected(s) for s in texts]
counts=[s.count(';') for s in texts]
decl.extend([int_array('parsed',parsed),int_array('counts',counts),
             int_array('expected_sums',[sum(parsed),sum(counts),sum(len(labels[i%3]) for i in range(len(texts)))])])
asm=['.section .text.heldout_wave,"ax"']
rows=[]
recipes=[]
for i,path in enumerate(args.arms):
    meta=json.loads(path.read_text())
    assert meta['sourceSHA256']==source_hash
    blob=path.with_suffix('.bin').read_bytes()
    assert sha(blob)==meta['imageSHA256'], path
    if i==0:assert sha(blob)==lock['control']['rv32SHA256'], 'first arm must be the frozen stock control'
    binary=main/f'arm{i}.bin'
    binary.write_bytes(blob)
    asm.extend(['.balign 32',f'base{i}:',f'.incbin "{binary}"'])
    entries=['readBurst','countEvents','label']
    funcs=[]
    for j,name in enumerate(entries):
        offset=meta['entries'][name]
        assert 0<=offset<len(blob) and offset%4==0
        sym=f'arm{i}_{j}'
        asm.extend([f'.global {sym}',f'.type {sym}, @function',f'.set {sym}, base{i}+{offset}'])
        signature=['const text *, const calibration *, int, int','const text *, int, int','text *, int, int'][j]
        decl.append(f'extern int {sym}({signature});')
        funcs.append(sym)
    rows.append('{'+','.join(funcs)+'}')
    recipes.append({'arm':path.stem,'imageBytes':len(blob),'imageSHA256':sha(blob),'entries':meta['entries']})
# A duplicate function pointer estimates order/timing variability on the same generated code and address.
rows.append(rows[0])
recipes.append({**recipes[0],'arm':'stock_repeat'})
decl.extend(['#define ARMS '+str(len(rows)),'static const program programs[ARMS]={'+','.join(rows)+'};'])
(main/'cases.h').write_text('\n'.join(decl)+'\n')
(main/'programs.S').write_text('\n'.join(asm)+'\n')
(main/'inputs.json').write_text(json.dumps({'sourceSHA256':source_hash,'arms':recipes},indent=2)+'\n')
