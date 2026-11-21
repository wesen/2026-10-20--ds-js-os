#!/usr/bin/env python3
"""Compile full-frame stock/candidate images; execute real RV32 and check every diagnostic cell against Wasm."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

POSES = [[68,61,31,25], [76,61,31,17], [127,32,159,0]]
CAPACITIES = {"pixels":25600, "depths":25600, "ids":25600, "work":2048}
COUNT_RE = re.compile(r"^\s*(\d+) (\w+) \(entered (\d+) times\)$",re.MULTILINE)
HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p/"picocalc-os/compiler/typed-rv32.js").exists())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def assembly(image, listing, pose, clean):
    lines = ['.section .text.start,"ax"', '.globl _start', '_start:']
    args = ["pixels","work"] if clean else list(CAPACITIES)
    for i, name in enumerate(args):
        lines.append(f'la a{i}, {name}')
    lines.append('sh zero,4(a1)' if clean else 'sh zero,4(a3)')  # work[0] requests the default width
    lines.extend(f'li a{i+len(args)}, {n}' for i,n in enumerate(pose))
    lines += ['call typedRayFrame' if clean else 'call typedRayRender', 'li t0, 1', 'bne a0,t0,.fail']
    for name,size in CAPACITIES.items():
        end = f'{name}End'
        lines += [f'la t0,{name}', 'lw t1,0(t0)', f'li t2,{size}', 'bne t1,t2,.fail',
                  f'la t0,{end}','lw t1,0(t0)','li t2,0xa5a5a5a5','bne t1,t2,.fail',
                  'lw t1,4(t0)','bne t1,t2,.fail']
        if name == 'pixels' or name in ('ids','depths') and not clean:
            lines += ['li a0,1',f'la a1,{name}+4',f'li a2,{size*2}','li a7,2','ecall']
    lines += ['li a0,0','li a7,1','ecall','.fail:','li a0,32','li a7,1','ecall','.section .text.typed,"ax"','.balign 4']
    for name,row in listing.items():
        assert re.fullmatch(r'[a-zA-Z_]\w*',name)
        lines += [f'.type {name},@function',f'{name}:',f'.incbin "{image.name}", {row["offset"]}, {row["bytes"]}']
    lines += ['.data','.balign 4']
    for name,size in CAPACITIES.items():
        lines += [f'{name}:',f'.word {size}', f'.fill {size},2,0xa5a5',
                  f'{name}End:', '.word 0xa5a5a5a5,0xa5a5a5a5']
    return '\n'.join(lines)+'\n'


def study(args, work):
    (work/'poses.json').write_text(json.dumps(POSES))
    subprocess.run(['node',str(HERE/'frame-images.mjs'),str(args.typed.resolve()),str(work)],cwd=ROOT,check=True)
    listing=json.loads((work/'listing.json').read_text())
    report={'sourceSHA256':sha(args.typed.read_bytes()),'poses':POSES,'arms':{}}
    for arm, static in listing.items():
        image=work/(arm+'.bin')
        armdata={'imageBytes':image.stat().st_size,'imageSHA256':sha(image.read_bytes()),
                 'static':static,'poses':[]}
        for clean in (False,True):
            for i,pose in enumerate(POSES):
                (work/'frame.S').write_text(assembly(image,static,pose,clean))
                subprocess.run([args.gcc,'-march=rv32im','-mabi=ilp32','-nostdlib','-mno-relax',
                                '-Wl,-Ttext=0x10000','-Wl,-e,_start','frame.S','-o','frame.elf'],cwd=work,check=True)
                exe=subprocess.run([args.emulator,'frame.elf'],cwd=work,env={'RV32_PROFILE':'2'},
                                   check=True,capture_output=True,timeout=180)
                expected=(work/f'wasm-{i}.bin').read_bytes()
                if clean: expected=expected[:51200]
                assert exe.stdout==expected, f'{arm} pose {pose} diagnostic buffers'
                table={fn:{'instructions':int(steps),'entries':int(calls)}
                       for steps,fn,calls in COUNT_RE.findall(exe.stderr.decode()) if fn in static}
                assert table['typedRayFrame' if clean else 'typedRayRender']['entries']==1
                row={'entry':'clean' if clean else 'audit','pose':pose,'pixelsSHA256':sha(expected[:51200]),
                     'typedInstructions':sum(r['instructions'] for r in table.values()),'byFunction':table}
                if not clean:
                    row.update(depthsSHA256=sha(expected[51200:102400]),idsSHA256=sha(expected[102400:]))
                armdata['poses'].append(row)
        report['arms'][arm]=armdata
    report['reductions']=[]
    for i,row in enumerate(report['arms']['stock']['poses']):
        a,b=(report['arms'][arm]['poses'][i]['typedInstructions'] for arm in ('stock','positive'))
        report['reductions'].append({'entry':row['entry'],'pose':row['pose'],'instructionsSaved':a-b,'percent':round(100*(a-b)/a,3)})
    return report


if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('typed',type=Path);cli.add_argument('gcc',type=Path)
    cli.add_argument('emulator',type=Path);cli.add_argument('output',type=Path)
    args=cli.parse_args(); args.gcc=args.gcc.resolve();args.emulator=args.emulator.resolve()
    with tempfile.TemporaryDirectory(prefix='typed-ray-compiler-') as tmp:
        report=study(args,Path(tmp))
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report['reductions']))
