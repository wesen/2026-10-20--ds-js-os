"""Keep focused compiler artifacts. Full TU/tree/RTL dumps regenerate in scratch."""
from pathlib import Path
import sys,re,json,subprocess,hashlib
root, dest, db = map(Path,sys.argv[1:4])
dest.mkdir(parents=True,exist_ok=True)
manifest=json.loads((root/'manifest.json').read_text())
gcc=next(k for k in manifest['versions'] if k.endswith('elf-gcc'))
def save(name,data):
    (dest/name).write_text('\n'.join(line.rstrip() for line in data.rstrip().splitlines())+'\n')
def function(text,name):
    return re.search(r'^define [^\n]*@'+name+r'\(.*?^}',text,re.M|re.S)[0]
def tree(text,name):
    return re.search(r'^;; Function '+name+r' \([^\n]+.*?(?=^;; Function |\Z)',text,re.M|re.S)[0]
source=next(r for r in json.loads(db.read_text()) if r['file'].endswith('/raytrace_demo.c'))
import shlex
args=shlex.split(source['command'])
original=Path(source['directory'])/args[args.index('-o')+1]
hashes=[]
for i,obj in enumerate((original,root/'firmware/gcc.o')):
    binary=root/f'trace-row-{i}.bin'
    subprocess.run([gcc[:-3]+'objcopy','--dump-section','.text.trace_row='+str(binary),obj,str(root/f'verify-{i}.o')],check=True)
    hashes.append(hashlib.sha256(binary.read_bytes()).hexdigest())
assert hashes[0]==hashes[1]
stats={}
for form in ('firmware','checked','unchecked'):
    d=root/form
    f='trace_row' if form=='firmware' else 'row'
    results={}
    for compiler in ['gcc','llvm']:
        asm=subprocess.check_output([gcc[:-3]+'objdump','-dr','--disassemble='+f,str(d/(compiler+'.o'))],text=True)
        start=asm.index('<'+f+'>:')
        save(form+'-'+compiler+'.asm',asm[start:].split('Disassembly of section')[0])
    for name in ['ssa','optimized']:
        s=tree(next(d.glob('gcc.c.*.'+name)).read_text(),f)
        save(form+'-gcc-'+name+'.txt',s)
    iv=tree(next(d.glob('gcc.c.*.ivopts')).read_text(),f)
    save(form+'-gcc-ivs.txt','\n\n'.join(re.findall(r'^Selected IV set .*?(?=Replacing exit test:|^;;\s*$|\Z)',iv,re.M|re.S)))
    ve=tree(next(d.glob('gcc.c.*.vect')).read_text(),f)
    save(form+'-gcc-vector.txt','\n'.join(x for x in ve.splitlines() if 'not vectorized:' in x or 'vectorized 0 loops in function' in x))
    save(form+'-llvm-optimized.ll',function((d/'opt.ll').read_text(),f))
    snapshots={}
    for chunk in re.split(r'(?=^; \*\*\* IR Dump After )',(d/'llvm-passes.txt').read_text(),flags=re.M):
        if not chunk: continue
        m=re.match(r'; \*\*\* IR Dump After (\w+) on .*? \*\*\*',chunk)
        if not m or m[1] not in ['SROAPass','InlinerPass','EarlyCSEPass','LoopVectorizePass','LowerExpectIntrinsicPass']: continue
        try:body=function(chunk,f)
        except TypeError:continue
        snapshots.setdefault(m[1],[]).append([len(re.findall(pattern,body)) for pattern in
             [r' = alloca ',r' = phi ',r'call [^\n]*?@element\(',r'call void @llvm.trap',r'load i32, ptr %work[, ]']])
    results['passColumns']=['alloca','phi','elementCalls','trapCallSites','headerLoadSites']
    results['llvmSnapshots']=snapshots
    for machine in ['finalize-isel','virtregrewriter','virtregrewriter,1']:
        mir=(d/(machine+'.mir')).read_text()
        section=re.search(r'^name:\s+'+f+r'\s*\n.*?^body:\s*\|\s*\n(.*?)^\.\.\.',mir,re.M|re.S)[1]
        save(form+'-'+machine.replace(',1','-final')+'.txt',section)
    lsr=subprocess.run(['llc-18','-O2','-print-after=loop-reduce','-filter-print-funcs='+f,
                        str(d/'opt.ll'),'-o',str(d/'lsr.s')],capture_output=True,text=True,check=True)
    save(form+'-llvm-strength-reduction.txt',lsr.stderr)
    ira=tree(next(d.glob('gcc.c.*.ira')).read_text(),f)
    disposition=ira.split('Disposition:')[-1].split('New iteration')[0]
    save(form+'-gcc-allocation.txt','Disposition:'+disposition[:3500])
    if form=='firmware':
        lim=next(d.glob('gcc.c.*.lim2')).read_text()
        save('firmware-gcc-motion.txt','\n'.join(re.findall(r'Moving statement\n[^\n]+\n\(cost [^\n]+',lim)))
    stats[form]=results
summary={'versions':manifest['versions'],'firmwareFlags':manifest['firmwareFlags'],'rowSectionSha256':hashes[0],
         'productionSourceSHA':manifest['source'],'functions':stats}
save('pass-metrics.json',json.dumps(summary,indent=2))
save('execution.json',(root/'execution.json').read_text())
