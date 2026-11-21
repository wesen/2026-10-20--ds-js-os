"""Execute linked RV32 objects and count guest PCs inside row on three inputs."""
import collections
import json
import re
import subprocess
import sys
from pathlib import Path
out=Path(sys.argv[1]).resolve()
scripts=Path(__file__).resolve().parent
gcc=next(k for k in json.loads((out/'manifest.json').read_text())['versions'] if k.endswith('elf-gcc'))
objdump=gcc[:-3]+'objdump'
nm=gcc[:-3]+'nm'
qemu='qemu-riscv32-static'
subprocess.run(['node',scripts/'03-fixtures.mjs',out/'fixtures'],check=True)
result={}
for form in ['checked','unchecked']:
    for tool in ['gcc','llvm','gcc-noiv','llc','llc-nolsr']:
        key=f'{form}-{tool}'
        exe=out/key
        subprocess.run([gcc,'-march=rv32imafc','-mabi=ilp32f','-nostdlib','-Wl,--no-relax','-Wl,-e,_start',
                        scripts/'04-start.S',out/form/(tool+'.o'),'-o',exe],check=True)
        syms=subprocess.check_output([nm,'-S',exe],text=True)
        match=re.search(r'^(\w+) (\w+) T row$',syms,re.M)
        lo,size=(int(x,16) for x in match.groups())
        asm=subprocess.check_output([objdump,'-d',exe],text=True)
        index={int(pc,16):(op,args) for pc,op,args in re.findall(r'^\s*([0-9a-f]+):\s+[0-9a-f]+\s+([\w.]+)[ \t]*(.*)$',asm,re.M)}
        samples={}
        total=collections.Counter()
        for y in range(160):
            args=[qemu]
            log=out/(key+'-trace.log')
            args+=['-one-insn-per-tb','-d','exec,nochain','-D',log]
            actual=subprocess.check_output([*args,exe],input=(out/'fixtures'/f'{y}.in').read_bytes())
            assert actual==(out/'fixtures'/f'{y}.gold').read_bytes(),(key,y)
            pcs=[int(x,16) for x in re.findall(r'Trace.*?\[[0-9a-f]+/([0-9a-f]+)/',log.read_text())]
            counts=collections.Counter(pc for pc in pcs if lo<=pc<lo+size)
            assert counts and all(pc in index for pc in counts)
            sample={'instructions':sum(counts.values()),'stackLoads':0,'stackStores':0}
            for pc,n in counts.items():
                op,args=index[pc]
                if '(sp)' in args and op in ('lw','lh','lhu','sw','sh'):
                    sample['stackStores' if op in ('sw','sh') else 'stackLoads']+=n
            total.update(sample)
            if y in (0,61,109): samples[y]=sample
        result[key]={'totals':dict(total),'rowsVerified':160,'rowBytes':size,'samples':samples}
        print(key,result[key],flush=True)
(out/'execution.json').write_text(json.dumps(result,indent=2)+'\n')
