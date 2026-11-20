"""Identify JS embedded in the actual factory backup and pinned measurement firmware."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def frozen(revision, path):
    return subprocess.check_output(['git','show',f'{revision}:picocalc-os/compiler/typed-{path}.js'])


work, staged, editor_source, frontend = map(Path,sys.argv[1:])
ref = '40bcf850a5809ef6d839127869faa952596ed157'
older = '08fbae85985b3d463e1d18c4f24c4cd8fcd06072'
assets = {'editorSource':editor_source.read_bytes(),
          'standardReactor':(work/'smoke/build/esp-idf/main/typed-world-reactor.elf').read_bytes()}
for name in ('wasm','rv32'):
    assets[f'frozen-{name}'] = frozen(ref,name)
    assets[f'older-{name}'] = frozen(older,name)
for variant in ('independent','native','bounded'):
    for path in (work/variant/'lanes').glob('*/typed/*.js'):
        assets[variant+'-'+path.parent.parent.name+'-'+path.stem] = path.read_bytes()
assets['smallReactor']=(staged/'slot80/build/esp-idf/main/typed-world-reactor.elf').read_bytes()
output={}
images = {'original':work/'original/factory-original.bin','slot80':staged/'slot80/build/picocalc-os-p4.bin'}
images['frontendSpecialist']=frontend/'build/picocalc-os-p4.bin'
images['stagedStandard']=work/'staged-standard/build/picocalc-os-p4.bin'
images['selectLive']=work/'bounded-live/build/picocalc-os-p4.bin'
images.update({v:work/v/'build/picocalc-os-p4.bin' for v in ('independent','native','bounded')})
for name,path in images.items():
    data=path.read_bytes()
    output[name]={'bytes':len(data),'sha':sha(data),'offsets':{key:data.find(val) for key,val in assets.items()}}
for name in ('wasm','rv32'):
    assert output['original']['offsets'][f'older-{name}']>=0
    assert output['original']['offsets'][f'frozen-{name}']==-1
    for variant in ('independent','native','bounded'):
        assert output[variant]['offsets'][f'frozen-{name}']>=0
        for key in assets:
            if key.startswith(variant+'-'): assert output[variant]['offsets'][key]>=0
for variant,item in output.items():
    assert item['offsets']['editorSource']>=0
    assert item['offsets']['smallReactor' if variant=='slot80' else 'standardReactor']>=0
for asset in ('frozen-wasm','frozen-rv32','independent-cursor-wasm'):
    assert output['frontendSpecialist']['offsets'][asset]>=0
for asset in ('bounded-select-wasm','bounded-select-rv32'):
    assert output['selectLive']['offsets'][asset]>=0
for variant in ('stagedStandard','slot80'):
    for asset in ('frozen-wasm','native-staged-rv32'):
        assert output[variant]['offsets'][asset]>=0
print(json.dumps({'frozenRevision':ref,'installedMatchingRevision':older,
                  'assets':{k:sha(v) for k,v in assets.items()},'images':output},indent=2))
