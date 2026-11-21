"""Inspect the frozen firmware object and isolate GCC's code for RGB565 packing."""
import argparse
import collections
import json
from pathlib import Path
import re
import shlex
import subprocess
import tempfile

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('build',type=Path)
args=parser.parse_args()
here=Path(__file__).resolve()
repo=next(p for p in here.parents if (p/'.git').exists())
build=args.build.resolve()
entry=next(r for r in json.loads((build/'compile_commands.json').read_text()) if r['file'].endswith('/raytrace_demo.c'))
cmd=shlex.split(entry['command'])
gcc=Path(cmd[0])
objdump=gcc.with_name(gcc.name.replace('-gcc','-objdump'))
arch=[a for a in cmd if a.startswith(('-march=','-mabi=','-O'))]
def instructions(obj, name):
    disasm=subprocess.check_output([str(objdump),'-d','-j','.text.'+name,str(obj)],text=True)
    return [m.group(1).strip() for m in re.finditer(r'^\s*[0-9a-f]+:\s+[0-9a-f]+\s+([^\n]+)$',disasm,re.M)]
with tempfile.TemporaryDirectory() as out:
    obj=Path(out)/'pack.o'
    subprocess.run([gcc,*arch,'-ffunction-sections','-I',repo/'picocalc-os/nucleus',
                    '-c',here.with_name('reference-pack.c'),'-o',obj],check=True)
    pack=instructions(obj,'director_rgb565')
firmware_obj=Path(entry['directory'])/cmd[cmd.index('-o')+1]
real=instructions(firmware_obj,'raytrace_demo_render')
counts=collections.Counter(i.split()[0] for i in real)
print(json.dumps(dict(compiler=subprocess.check_output([gcc,'-dumpfullversion'],text=True).strip(),
                      targetOptions=arch,productionRenderStaticInstructions=len(real),
                      productionRenderOpcodes=dict(sorted(counts.items())),
                      packStaticInstructions=len(pack),isolatedPack=pack),indent=2))
