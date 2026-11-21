"""Run the exact relocated board function bytes on QEMU and sum guest PCs inside the kernel."""
from pathlib import Path
import collections,hashlib,json,os,re,shutil,struct,subprocess,sys
T=Path(__file__).resolve().parents[1]
old=next(T.parent.glob('PICOCALC-SHADOW-CODEGEN--*'))
elf,images,work=map(lambda s:Path(s).resolve(),sys.argv[1:]);work.mkdir(exist_ok=True,parents=True)
gcc=next(p for p in Path.home().glob('.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/*/bin/riscv32-esp-elf-gcc'))
objdump=str(gcc).replace('-gcc','-objdump');nm=str(gcc).replace('-gcc','-nm')
def get(*cmd):return subprocess.check_output(cmd,cwd=work,text=True)
def symbols(path):return {n:(int(a,16),int(z,16)) for a,z,n in re.findall(r'^([a-f0-9]+) ([a-f0-9]+) \w (\S+)$',get(nm,'-S',path),re.M)}
def image_at(address,size):
    off=struct.unpack_from('<I',raw,32)[0];stride,n=struct.unpack_from('<HH',raw,46)
    for i in range(n):
        _,typ,flags,base,filepos,length=struct.unpack_from('<6I',raw,off+i*stride)
        if typ==1 and flags&4 and base<=address and address+size<=base+length:
            return raw[filepos+address-base:filepos+address-base+size]
    raise ValueError(hex(address))
raw=elf.read_bytes();syms=symbols(elf)
cases=json.loads((old/'various/board/candidate-images.json').read_text())
typed=json.loads((old/'various/compile/general.json').read_text())
hdr=(images/'inputs.h').read_text();meta=list(map(int,re.search(r'\{"default",[^{}]+\{([\d,]+)\}',hdr)[1].split(',')))
mask=(images/'masks.bin').read_bytes()[:25600]
assert hashlib.sha256(mask).hexdigest()==json.loads((old/'various/board/paths.json').read_text())[0]['maskSHA']
inputs=[(i%160,i//160,x-1) for i,x in enumerate(mask) if x]
(work/'samples.bin').write_bytes(b''.join(bytes(v) for v in inputs))
(work/'harness.c').write_text('''extern int kernel(void*,int,int); extern unsigned char samples[];
static const struct {unsigned cap;unsigned short data[2048];} surf={2048,{'''+','.join(map(str,meta))+'''}};
int execute(void) {for(int i=0;i<'''+str(len(inputs))+''';i++){
 const unsigned char *s=samples+3*i;if(kernel((void*)&surf,s[0],s[1])!=s[2]) return 1;}return 0;}
''')
(work/'entry.S').write_text('''.text
.globl _start
_start:
 call execute
 li a7, 93
 ecall
.section .rodata
.globl samples
samples:
.incbin "samples.bin"
.section .text.kernel,"ax",@progbits
.balign 16
.globl kernel
.type kernel,@function
kernel:
.incbin "body.bin"
.size kernel,.-kernel
''')
result={};evidence=T/'various/native'
for arm,name in [('gcc','checked_shadow'),('llvm','llvm_kernel'),('nolsr','nolsr_kernel'),('fastreg','fastreg_kernel'),('wrap','wrap_kernel'),('typed','typed_kernel')]:
    if arm=='typed':
        # GNU nm omits size-zero symbols under -S; LLVM nm emits an explicit zero.
        addr=int(re.search(r'^([\da-f]+) \w typed_kernel$',get(nm,elf),re.M)[1],16)
        size=typed['shadowBytes']
    else:addr,size=syms[name]
    blob=image_at(addr,size)
    if arm=='typed':
        im=(images/'image_0_2.bin').read_bytes();assert hashlib.sha256(im).hexdigest()==typed['imageSHA']
        entry=cases['records'][4]['entries']['typedRayInShadow'];assert im[entry:entry+size]==blob
    (work/'body.bin').write_bytes(blob)
    subprocess.run([gcc,'-march=rv32imafc','-mabi=ilp32f','-O2','-ffreestanding','-nostdlib','-msmall-data-limit=0','-Wl,--no-relax','-Wl,-e,_start','entry.S','harness.c','-o','test'],cwd=work,check=True)
    lo,sz=symbols(work/'test')['kernel'];assert sz==len(blob)
    asm=get(objdump,'-d','-z','-M','no-aliases', '--start-address='+str(lo),'--stop-address='+str(lo+size),'test')
    ins={int(pc,16):(op,args) for pc,op,args in re.findall(r'^[ \t]*([\da-f]+):[ \t]+[\da-f]+[ \t]+([\w.]+)[ \t]*([^\n]*)$',asm,re.M)}
    (evidence/(arm+'-linked.asm')).write_text(asm)
    subprocess.run(['qemu-riscv32-static','-one-insn-per-tb','-d','exec,nochain','-dfilter',f'{hex(lo)}..{hex(lo+size-1)}','-D','trace.log','./test'],cwd=work,check=True)
    freq=collections.Counter()
    with (work/'trace.log').open('rb') as log:
        search=re.compile(rb'\[\w+/([0-9a-f]+)/').search
        for line in log:
            m=search(line)
            if m:
                pc=int(m[1],16)
                if lo<=pc<lo+sz:freq[pc]+=1
    assert freq[lo]==len(inputs),(arm,freq[lo])
    assert set(freq).issubset(ins), (arm, set(freq)-set(ins))
    totals=collections.Counter();pcrows=[]
    for pc in sorted(ins):
        op,args=ins[pc];n=freq[pc];totals['instructions']+=n
        access=op.removeprefix('c.').removesuffix('sp')
        if access in ['lw','sw','lh','lhu','sh']:
            stack='(sp)' in args
            category=('stack' if stack else 'data')+access.upper()
            totals[category]+=n
        pcrows.append([pc-lo,op,args,n])
    traps={pc for pc,(op,args) in ins.items() if op in ('ebreak','c.ebreak','unimp','c.unimp')}
    assert traps,(arm,asm[-700:])
    for pc,(op,args) in ins.items():
        if not op.removeprefix('c.').startswith('b'):continue
        target=re.search(r'<kernel\+0x([0-9a-f]+)>',args)
        on_trap_edge=target and lo+int(target[1],16) in traps
        if on_trap_edge or (arm=='typed' and pc+4 in traps):
            totals['boundsBranchSites']+=1
            totals['boundsBranches']+=freq[pc]
    if arm=='typed':assert totals['instructions']==typed['shadow']['steps']
    result[arm]=dict(physicalSymbol=name,physicalAddress=hex(addr),kernelBytes=size,sha256=hashlib.sha256(blob).hexdigest(),calls=len(inputs),totals=dict(totals),pcs=pcrows)
    print(arm,result[arm]['totals'],flush=True)
(T/'various/native/pcs.json').write_text(json.dumps(result,indent=1)+'\n')
