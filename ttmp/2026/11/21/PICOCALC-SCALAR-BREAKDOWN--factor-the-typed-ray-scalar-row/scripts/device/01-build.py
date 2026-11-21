"""Attach five measured compiler variants to the already configured ordinary SDK build."""
import argparse,hashlib,json,shutil,subprocess
from pathlib import Path

ticket=Path(__file__).resolve().parents[2]
repo=next(p for p in ticket.parents if (p/'.git').is_dir())
prior=next((ticket.parent.parent/'20').glob('PICOCALC-RAYTRACE--*'))
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('stage',type=Path)
parser.add_argument('backends',nargs=5,type=Path,metavar='CHECK_STACK,HOIST_STACK,CHECK_REG,HOIST_REG,SKIP_REG')
parser.add_argument('--idf',type=Path,default=Path('/home/manuel/esp/esp-idf-5.4.2/export.sh'))
a=parser.parse_args()
revision=subprocess.check_output(['git','rev-parse','--verify',a.revision+'^{commit}'],text=True).strip()
stage=a.stage.resolve()
assert stage!=repo and (stage/'revision').is_file()
subprocess.run(['python3',prior/'scripts/device/03-rebuild-stage.py',stage,revision],check=True)
keys=['CHECK_STACK','HOIST_STACK','CHECK_REG','HOIST_REG','SKIP_REG']
folder=stage/'factor-backends';folder.mkdir(exist_ok=True)
paths=[]
for key,src in zip(keys,a.backends,strict=True):
    dest=folder/(key+'.js')
    shutil.copyfile(src,dest);paths.append(dest)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
assert len({sha(x) for x in paths})==5
port=stage/'tree/picocalc-os/port/esp32p4'
shell=(port/'build-smooth-chess.sh').read_text();anchor='-D PICOCALC_CHESS_3D=ON build'
assert shell.count(anchor)==1
# Reapply the six retained optional compiler/source settings as well as the new five.
archive=stage/'arms';existing={'DIV':'typed-rv32-div.js','SPAN':'spans.typed','SHADOW':'spans-and-shadow.typed',
                                'PACKED':'PACKED','INFERRED':'INFERRED','MATCHED':'MATCHED'}
settings={k:archive/v for k,v in existing.items()}
settings.update(dict(zip(keys,paths,strict=True)))
assert all(x.is_file() for x in settings.values())
flags=' '.join(f'-D "PICOCALC_TYPED_RAY_{k}={v}"' for k,v in settings.items())
script=port/'build-scalar-factors.sh';script.write_text(shell.replace(anchor,'-D PICOCALC_CHESS_3D=ON '+flags+' build'))
subprocess.run(['bash','-c','source "$1" && bash "$2" "$3"','scalar-factors',a.idf,script,stage/'build'],check=True)
app=stage/'build/picocalc-os-p4.bin';part=stage/'build/partition_table/partition-table.bin'
assert sha(part)=='72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30'
receipt=dict(revision=revision,appSHA=sha(app),appBytes=app.stat().st_size,partitionSHA=sha(part),sdkconfigSHA=sha(stage/'build/sdkconfig.smooth-chess'),sources={k:sha(v) for k,v in settings.items()})
(stage/'factor-build.json').write_text(json.dumps(receipt,indent=2)+'\n')
image_rows=subprocess.check_output(['node',Path(__file__).with_name('03-images.mjs'),stage],text=True)
images=json.loads(image_rows)
assert len(images)==len(set(x['nativeSHA'] for x in images))==7
(stage/'factor-images.json').write_text(image_rows)
print('FACTOR_BUILD',sha(app))
