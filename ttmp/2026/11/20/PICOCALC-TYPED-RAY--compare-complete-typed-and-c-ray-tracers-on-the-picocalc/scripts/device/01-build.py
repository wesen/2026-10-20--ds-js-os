"""Build the ordinary fixed-profile image plus frozen, switchable research backends."""
import argparse, hashlib, json, shutil, subprocess
from pathlib import Path
here=Path(__file__).resolve()
ticket=here.parents[2]
repo=next(p for p in here.parents if (p/'.git').is_dir())
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('revision');p.add_argument('stage',type=Path);p.add_argument('managed',type=Path)
p.add_argument('--reuse-stage',action='store_true',help='reuse a prior isolated build from the normal release builder')
p.add_argument('--idf',type=Path,default=Path('/home/manuel/esp/esp-idf-5.4.2/export.sh'))
p.add_argument('--matched-backend',type=Path)
p.add_argument('--packed-backend',type=Path);p.add_argument('--inferred-backend',type=Path)

a=p.parse_args()
rev=subprocess.check_output(['git','rev-parse',a.revision+'^{commit}'],text=True).strip()
stage=a.stage.resolve();tree=stage/'tree'
if a.reuse_stage:
    assert stage!=repo and (stage/'revision').is_file() and (stage/'build/picocalc-os-p4.bin').is_file()
    helper=next(ticket.parent.glob('PICOCALC-RAYTRACE--*'))/'scripts/device/03-rebuild-stage.py'
    subprocess.run(['python3',helper,stage,rev],check=True)
    paths=[str(ticket.relative_to(repo)/'scripts')]
else:
    stage.mkdir(parents=True,exist_ok=False);tree.mkdir()
    paths=['cji','picocalc-os',str(ticket.relative_to(repo)/'scripts')]
with subprocess.Popen(['git','archive',rev,*paths],stdout=subprocess.PIPE) as arch:
    subprocess.run(['tar','-xC',str(tree)],stdin=arch.stdout,check=True);assert arch.wait()==0
source=tree/'picocalc-os';port=source/'port/esp32p4';out=stage/'build'
if not a.reuse_stage:shutil.copytree(a.managed,port/'managed_components')
experiments=stage/'arms';experiments.mkdir(exist_ok=a.reuse_stage)
scripts=tree/ticket.relative_to(repo)/'scripts'
div=experiments/'typed-rv32-div.js'
subprocess.run(['node',scripts/'compiler/positive-divisors.mjs',source/'compiler/typed-rv32.js',div],check=True)
span=experiments/'spans.typed'
subprocess.run(['python3',scripts/'director/make-spans.py',span],cwd=tree,check=True)
shadow=experiments/'spans-and-shadow.typed'
subprocess.run(['python3',scripts/'director/make-shadow.py',span,shadow],cwd=tree,check=True)
files={'DIV':div,'SPAN':span,'SHADOW':shadow}
for name,path in [('PACKED',a.packed_backend),('INFERRED',a.inferred_backend),('MATCHED',a.matched_backend)]:
    if path:
        dest=experiments/name;shutil.copyfile(path,dest);files[name]=dest
# Preserve each ordinary profile switch; add only paths to bundled comparison inputs.
build=(port/'build-smooth-chess.sh').read_text()
anchor='-D PICOCALC_CHESS_3D=ON build'
assert build.count(anchor)==1
build=build.replace(anchor,'-D PICOCALC_CHESS_3D=ON '+' '.join(f'-D "PICOCALC_TYPED_RAY_{k}={v}"' for k,v in files.items())+' build')
shell=port/'build-typed-ray-research.sh';shell.write_text(build)
(stage/'revision').write_text(rev+'\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
(stage/'arms.json').write_text(json.dumps({k:sha(v) for k,v in files.items()},indent=2)+'\n')
subprocess.run(['bash','-c','source "$1" && bash "$2" "$3"','typed-ray',a.idf,shell,out],check=True)
print('qualified build inputs:',rev,sha(out/'picocalc-os-p4.bin'))
