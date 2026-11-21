"""Execute complete raw RV32 images and compare all payloads, padding and canaries with production C."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import tempfile
from pathlib import Path

here=Path(__file__).resolve().parent
root=next(p for p in here.parents if (p/'picocalc-os/compiler/typed-rv32.js').exists())
prior=next((root/'ttmp/2026/11/20').glob('PICOCALC-TYPED-RAY--*'))
spec=importlib.util.spec_from_file_location('prior_frame',prior/'scripts/compiler/full-frame.py')
frame=importlib.util.module_from_spec(spec)
spec.loader.exec_module(frame)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path)
parser.add_argument('backend_dir',type=Path)
parser.add_argument('gcc',type=Path)
parser.add_argument('emulator',type=Path)
parser.add_argument('out',type=Path)
args=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='scalar-factor-frames-') as temp:
    work=Path(temp)
    nuc=root/'picocalc-os/nucleus'
    subprocess.run(['cc','-std=c11','-O2','-I',nuc,prior/'scripts/renderer/01-reference.c',nuc/'raytrace_demo.c','-o',work/'reference'],check=True)
    cases=json.loads(subprocess.check_output([work/'reference',work]))
    subprocess.run(['node',here/'export-images.mjs',args.source.resolve(),args.backend_dir.resolve(),work],cwd=root,check=True)
    lists=json.loads((work/'listing.json').read_text())
    receipt={'sourceSHA256':hashlib.sha256(args.source.read_bytes()).hexdigest(),'arms':{}}
    for name,listing in lists.items():
        image=work/(name+'.bin')
        results=[]
        for case in cases:
            stride=case['stride']
            for plane in ('pixels','depths','ids'):frame.CAPACITIES[plane]=160*stride
            gold=[(work/(case['name']+'.'+suffix)).read_bytes()[2:-2] for suffix in ('color','depth','id')]
            for clean in (False,True):
                body=frame.assembly(image,listing,case['scene'],clean)
                init='sh zero,4(a1)' if clean else 'sh zero,4(a3)'
                body=body.replace(init,'li t3,'+str(stride)+'\n'+init.replace('zero','t3'))
                (work/'main.S').write_text(body)
                subprocess.run([args.gcc.resolve(),'-march=rv32im','-mabi=ilp32','-nostdlib','-mno-relax',
                                '-Wl,-Ttext=0x10000','-Wl,-e,_start','main.S','-o','main.elf'],cwd=work,check=True)
                run=subprocess.run([args.emulator.resolve(),'main.elf'],cwd=work,env={'RV32_PROFILE':'2'},check=True,capture_output=True)
                assert run.stdout==b''.join(gold[:1] if clean else gold),(name,case['name'],clean)
                counts={fn:int(count) for count,fn,_ in frame.COUNT_RE.findall(run.stderr.decode()) if fn in listing}
                results.append({'fixture':case['name'],'stride':stride,'entry':'clean' if clean else 'audit',
                                'retired':sum(counts.values()),'primaryRow':counts['typedRayComputeRow'],
                                'shadow':counts['typedRayInShadow']})
        receipt['arms'][name]={'imageSHA256':hashlib.sha256(image.read_bytes()).hexdigest(),'rows':results}
        print(name,results[1],flush=True)
    args.out.write_text(json.dumps(receipt,indent=2)+'\n')
