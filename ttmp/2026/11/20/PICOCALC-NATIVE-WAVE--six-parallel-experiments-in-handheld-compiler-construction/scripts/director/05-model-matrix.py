"""Compare dynamic guest instructions on the exact programs linked for the physical trial."""
from pathlib import Path
import argparse
import json
import hashlib
import struct
import subprocess
import tempfile

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('work',type=Path)
parser.add_argument('gcc',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
here=Path(__file__).resolve().parent
root=next(p for p in here.parents if (p/'.git').is_dir())
src=(args.work/'main/bench.c').read_text()
common=src[src.index('typedef struct'):src.index('void app_main(void)')]
model=r"""
#include <stdint.h>
#include <stdbool.h>
typedef unsigned size_t;
static void *fill(void *dest,int value,size_t len) {
    unsigned char *p=dest;
    for(size_t i=0;i<len;++i)p[i]=value;
    return dest;
}
#define memset fill
"""
model+=common
model+=r"""
static uint32_t steps(void) {
    register uint32_t a0 asm("a0");
    register uint32_t a7 asm("a7")=10;
    asm volatile("ecall":"=r"(a0):"r"(a7):"a1","memory");
    return a0;
}
static void emit(const unsigned *row) {
    register uint32_t a0 asm("a0")=1,a2 asm("a2")=16,a7 asm("a7")=2;
    register const void *a1 asm("a1")=row;
    asm volatile("ecall":"+r"(a0):"r"(a1),"r"(a2),"r"(a7):"memory");
}
static void finish(int code) {
    register int a0 asm("a0")=code,a7 asm("a7")=1;
    asm volatile("ecall"::"r"(a0),"r"(a7):"memory");
    __builtin_unreachable();
}
void _start(void) {
    for(unsigned a=0;a<ARMS;++a) {
        if(!verify(&programs[a]))finish(2);
        for(unsigned e=0;e<ENDPOINTS;++e) {
            unsigned begin=steps();
            int sum=replay(&programs[a],e);
            unsigned count=steps()-begin;
            if(sum!=expected_sums[e])finish(3);
            unsigned row[]={a,e,count,(unsigned)sum};emit(row);
        }
    }
    finish(0);
}
"""
meta=json.loads((args.work/'main/inputs.json').read_text())
with tempfile.TemporaryDirectory(prefix='pico-wave-model-') as tmp:
    tmp=Path(tmp)
    (tmp/'guest.c').write_text(model)
    subprocess.run([args.gcc.resolve(),'-march=rv32im','-mabi=ilp32','-O2','-fno-builtin','-nostdlib',
                    '-msmall-data-limit=0','-mno-relax','-Wl,-Ttext=0x10000','-Wl,-e,_start',
                    '-I',str(args.work.resolve()/'main'),'guest.c',str(args.work.resolve()/'main/programs.S'),'-o','guest.elf'],
                   check=True,cwd=tmp)
    subprocess.run(['cc','-O2',str(root/'cji/tools/rv32/emu.c'),'-lm','-o','rv32emu'],cwd=tmp,check=True)
    data=subprocess.check_output(['./rv32emu','guest.elf'],cwd=tmp)
    samples=list(struct.iter_unpack('<4I',data))
    assert len(samples)==3*len(meta['arms'])
    rows=[{'arm':meta['arms'][a]['arm'],'endpoint':['parse','count','label'][e],
           'instructions':steps,'value':value} for a,e,steps,value in samples]
    args.output.write_text(json.dumps({'inputs':meta,'rows':rows},indent=2)+'\n')
    print([(x['arm'],x['endpoint'],x['instructions']) for x in rows])
