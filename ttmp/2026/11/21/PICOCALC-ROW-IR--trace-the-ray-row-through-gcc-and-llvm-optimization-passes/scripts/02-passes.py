"""Run from repo root. Takes an output directory and IDF compile_commands.json."""
import hashlib
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path

out=Path(sys.argv[1]).resolve()
ticket=Path(__file__).resolve().parents[1]
row=ticket/'scripts/01-row.c'
db=next(r for r in json.loads(Path(sys.argv[2]).read_text()) if r['file'].endswith('/raytrace_demo.c'))
prod=Path(db['file'])
assert prod.read_bytes()==Path('picocalc-os/nucleus/raytrace_demo.c').read_bytes()
flags=shlex.split(db['command'])
gcc,*flags=flags
del flags[flags.index('-o'):flags.index('-o')+2]
flags.remove('-c')
flags.remove(str(prod))
objdump=gcc.removesuffix('gcc')+'objdump'
out.mkdir(exist_ok=True,parents=True)
clang='clang-18'
commands=[]
def run(args,folder,stdout=None,stderr=None):
    commands.append(shlex.join(map(str,args)))
    with (folder/stdout).open('w') if stdout else open('/dev/null','w') as o:
        with (folder/stderr).open('w') if stderr else open('/dev/null','w') as e:
            p=subprocess.run(args,cwd=folder,stdout=o,stderr=e)
    if p.returncode:
        raise RuntimeError((p.returncode,commands[-1],(folder/stderr).read_text()[-2000:] if stderr else ''))
def llvm(name,src,base,fn,folder):
    run([clang,*base,'-O2','-Xclang','-disable-llvm-passes','-fno-discard-value-names','-S','-emit-llvm',src,'-o','raw.ll'],folder,stderr='clang.log')
    run(['opt-18','-passes=default<O2>','-S','raw.ll','-o','opt.ll','-filter-print-funcs='+fn,'-print-after-all','-pass-remarks-missed=loop-vectorize'],folder,stderr='llvm-passes.txt')
    run(['opt-18','-passes=default<O2>','-S','raw.ll','-o','opt.ll'],folder,stderr='opt.log')
    run(['llc-18','-O2','opt.ll','-o','llvm.s'],folder,stderr='llc.log')
    for phase in ['finalize-isel','virtregrewriter']:
        run(['llc-18','-O2','-stop-after='+phase,'opt.ll','-o',phase+'.mir'],folder,stderr='llc.log')
    run([clang,*base,'-O2','-c',src,'-o','llvm.o','-Rpass-missed=loop-vectorize','-Rpass-analysis=loop-vectorize'],folder,stderr='remarks.txt')
dumpflags=['-fdump-tree-ssa','-fdump-tree-lim2-details','-fdump-tree-ivopts-details','-fdump-tree-vect-details','-fdump-tree-optimized','-fdump-rtl-ira','-fdump-rtl-final']
common=['-march=rv32imafc','-mabi=ilp32f','-fno-strict-aliasing','-fwrapv','-ffreestanding']
for name in ('firmware','checked','unchecked'):
    folder=out/name
    folder.mkdir(exist_ok=True)
    if name=='firmware':
        # Use the actual GCC command for the control. Feed its preprocessed TU to
        # LLVM so target-specific preprocessor branches and SDK macros match.
        run([gcc,*flags,'-E','-P',prod,'-o','firmware.i'],folder,stderr='preprocess.log')
        gccargs=[*flags,prod]
        src='firmware.i'; fn='trace_row'
        llvmflags=['--target=riscv32-unknown-elf','-march=rv32imafc','-mabi=ilp32f','-Wno-unknown-attributes']
    else:
        define='-DCHECKED='+str(int(name=='checked'))
        gccargs=[*common,'-O2',define,row]
        llvmflags=['--target=riscv32-unknown-elf',*common,define]
        src=row; fn='row'
    run([gcc,*gccargs,*dumpflags,'-c','-o','gcc.o'],folder,stderr='gcc.log')
    llvm(name,src,llvmflags,fn,folder)
    if name != 'firmware':
        run([gcc,*gccargs,'-fno-ivopts','-c','-o','gcc-noiv.o'],folder,stderr='ablation.log')
        for variant,extra in [('llc',[]),('llc-nolsr',['-disable-lsr'])]:
            run(['llc-18','-O2',*extra,'-filetype=obj','opt.ll','-o',variant+'.o'],folder,stderr='ablation.log')
    for arm in ('gcc','llvm'):
        run([objdump,'-dr','-M','no-aliases',arm+'.o'],folder,stdout=arm+'.asm')
versions={p:subprocess.check_output([p,'--version'],text=True).splitlines()[0] for p in [gcc,clang,'opt-18','llc-18',objdump]}
(out/'manifest.json').write_text(json.dumps({'versions':versions,'source':hashlib.sha256(prod.read_bytes()).hexdigest(),'firmwareFlags':[f for f in flags if f.startswith(('-m','-O','-fno-strict','-fwrap','-std='))],'commands':commands},indent=2)+'\n')
