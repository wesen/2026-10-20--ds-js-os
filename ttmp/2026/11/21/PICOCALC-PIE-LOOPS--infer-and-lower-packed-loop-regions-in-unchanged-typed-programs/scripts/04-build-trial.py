"""Build the two experimental selectors in the existing SDK research stage, leaving the verified restore directory intact."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

stage, out = map(lambda x: Path(x).resolve(), sys.argv[1:3])
out.mkdir(parents=True,exist_ok=True)
base = json.loads((stage/'factor-build.json').read_text())
assert base['appSHA'] == 'e7b771aabc1a9cb0719caa5e30a1b7beed7d4ed33e05e600766246ea492a19b5'
port = stage/'tree/picocalc-os/port/esp32p4'
compiler = Path('picocalc-os/compiler')
script = (port/'build-scalar-factors.sh').read_text()
old = 'const mode = options?.pieLoops;'
backend = (compiler/'typed-rv32.js').read_text()
assert backend.count(old)==1
for label, mode in [('INFERRED','pie'),('MATCHED','scalar')]:
    bundle = out/(mode+'.js')
    bundle.write_text((compiler/'typed-pie-loops.js').read_text()+'\n'+backend.replace(old,'const mode = "'+mode+'";'))
    if mode == 'scalar' and len(sys.argv) == 4:
        frozen = Path(sys.argv[3]).read_bytes()
        assert hashlib.sha256(frozen).hexdigest() == '76f049ec82da5d5550c1478c40ebb2fdce7f1bb019988977bad4b028b94e4391'
        bundle.write_bytes(frozen)
    needle = 'PICOCALC_TYPED_RAY_'+label+'='+str(stage/'arms'/label)
    assert script.count(needle)==1
    script = script.replace(needle,'PICOCALC_TYPED_RAY_'+label+'='+str(bundle))
# build-smooth-chess.sh derives its port directory from BASH_SOURCE.
trial = port/'build-inferred-loop-trial.sh'
trial.write_text(script)
target = stage/'tree/picocalc-os/compiler/typed-wasm.js'
target.write_bytes((compiler/'typed-wasm.js').read_bytes())
subprocess.run(['bash','-c','source "$1" && bash "$2" "$3"','pie-regions','/home/manuel/esp/esp-idf-5.4.2/export.sh',trial,stage/'build'],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
app=stage/'build/picocalc-os-p4.bin'
part=stage/'build/partition_table/partition-table.bin'
assert sha(part)==base['partitionSHA']
(out/'build.json').write_text(json.dumps({'appSHA':sha(app),'partitionSHA':sha(part),'baseAppSHA':base['appSHA'],
    'stageRevision':(stage/'revision').read_text().strip(),'codeRevision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
    'rv32':sha(compiler/'typed-rv32.js'),'wasm':sha(target),'analyzer':sha(compiler/'typed-pie-loops.js'),
    'selector8':'unfiltered-pie' if len(sys.argv)==4 else 'matched-scalar',
    'modes':{m:sha(out/(m+'.js')) for m in ['scalar','pie']}},indent=2)+'\n')
