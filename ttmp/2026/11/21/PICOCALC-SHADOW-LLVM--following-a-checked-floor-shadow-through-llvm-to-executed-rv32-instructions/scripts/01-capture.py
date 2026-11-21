"""Capture the exact checked halfword predicate, every printable LLVM pass, and native alternatives."""
import gzip, hashlib, json, os, re, shlex, subprocess, sys
from pathlib import Path
T=Path(__file__).resolve().parents[1]
old=next(T.parent.glob('PICOCALC-SHADOW-CODEGEN--*'))
O=Path(sys.argv[1]).resolve(); O.mkdir(exist_ok=True,parents=True)
P=T/'various/llvm-pipeline'; P.mkdir(exist_ok=True)
S=T/'various/native'; S.mkdir(exist_ok=True)
base=(old/'scripts/board/bench.c').read_text()
parts=[base[base.index('typedef struct { uint32_t cap;'):].split('\n')[0],
       base[base.index('static inline int checked_read'):base.index('#define CELL(i) w->cells')]]
source='#define uint32_t unsigned int\n#define uint16_t unsigned short\n#define abs __builtin_abs\n'+'\n'.join(parts)
source=source.replace('#include "layout.inc"',(old/'scripts/board/layout.inc').read_text())
source+='\nextern __typeof(checked_shadow) kernel __attribute__((alias("checked_shadow")));\n'
(O/'kernel.c').write_text(source)
commands=[]
def run(cmd):
    commands.append(shlex.join(cmd))
    return subprocess.run(cmd,cwd=O,check=True,capture_output=True)
def sha(x):return hashlib.sha256(x).hexdigest()
def zipped(p,data):p.write_bytes(gzip.compress(data,compresslevel=9,mtime=0))
def snapshot(case,phase,data,cmd):
    name=case+'-'+phase
    items=[dict(offset=m.start(),header=m[1].decode().strip()) for m in re.finditer(rb'^[;# ]*\*\*\* (IR Dump After [^\n]*?)(?: \*\*\*)?\r?$',data,re.M)]
    assert items
    zipped(P/(name+'.log.gz'),data);zipped(P/(name+'.index.json.gz'),json.dumps(items).encode())
    return dict(command=cmd,sha256=sha(data),rawBytes=len(data),dumps=len(items))
manifest={}; variants={}
flags=['--target=riscv32-unknown-elf','-march=rv32imafc','-mabi=ilp32f','-ffreestanding','-ffunction-sections']
for case,extras in [('checked',[]),('wrap',['-fwrapv'])]:
    raw=case+'-raw.ll'; opt=case+'-opt.ll'
    run(['clang-18',*flags,'-O3',*extras,'-Xclang','-disable-llvm-passes','-fno-discard-value-names','-S','-emit-llvm','kernel.c','-o',raw])
    mid=['opt-18','-passes=default<O3>','-print-after-all','-S',raw,'-o',opt]
    manifest[case]={'middle':snapshot(case,'middle',run(mid).stderr,mid)}
    zipped(P/(case+'-raw.ll.gz'),(O/raw).read_bytes());zipped(P/(case+'-opt.ll.gz'),(O/opt).read_bytes())
    for suffix,extra in ([('llvm',[]),('nolsr',['-disable-lsr']),('fastreg',['-regalloc=fast','-optimize-regalloc=false'])] if case=='checked' else [('wrap',[])]):
        cmd=['llc-18','-O3',*extra,'-print-after-all','-filetype=obj',opt,'-o',suffix+'.o']
        r=run(cmd)
        if not extra:manifest[case]['backend']=snapshot(case,'backend',r.stderr,cmd)
        variants[suffix]=sha((O/(suffix+'.o')).read_bytes())
        run(['llc-18','-O3',*extra,opt,'-o',suffix+'.s'])
        (S/(suffix+'.s')).write_bytes((O/(suffix+'.s')).read_bytes())
(P/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(S/'kernel.c').write_text(source)
(S/'build.json').write_text(json.dumps(dict(compiler=run(['clang-18','--version']).stdout.decode().splitlines()[0],
    sourceSHA=sha(source.encode()),objects=variants,commands=commands),indent=2)+'\n')
print([(k,{p:e["dumps"] for p,e in v.items()}) for k,v in manifest.items()])
