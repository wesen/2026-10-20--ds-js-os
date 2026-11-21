"""Attest an ordinary build against the last playable image and the independent compiler trial."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

def digest(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    return json.loads(path.read_text())

p = argparse.ArgumentParser(description=__doc__)
for name in ('stage','output'):
    p.add_argument(name,type=Path)
a = p.parse_args()
stage = a.stage.resolve()
day = Path(__file__).resolve().parents[3]
control = read(next(day.glob('PICOCALC-RELEASE-LAB--*/various/release.json')))
historical = read(next(day.glob('PICOCALC-NATIVE-WAVE--*/various/director/composed-release-worlds.json')))
old = historical['chess']['arms']['early-stock']
new = historical['chess']['arms']['late-leaf']
assert new['linkedELFSHA256'] != old['linkedELFSHA256']
subprocess.run(['node',next(day.glob('PICOCALC-CHESS-3D--*/scripts/camera/07-qualify-build.mjs')),stage,stage/'qualify.json'],check=True)
out = read(stage/'qualify.json')
revision = (stage/'revision').read_text().strip()
base = '5f77855'
files = subprocess.check_output(['git','diff','--name-only',base,revision,'--','cji','picocalc-os'],text=True).splitlines()
assert sorted(files)==['picocalc-os/compiler/typed-rv32.js','picocalc-os/compiler/typed-wasm.js']
raw = (stage/'build/picocalc-os-p4.bin').read_bytes()
assert len(raw)<8*1024*1024 and digest(raw)==out['firmwareSHA256']
assert out['partitionSHA256']==control['partition']['sha256']
assert out['chess']['linkedSHA256']==new['linkedELFSHA256'] and out['chess']['codeBytes']==new['instructionsBytes']
assert b'camobs' not in raw
assert 'CONFIG_ELF_LOADER_LOAD_PSRAM=y' in (stage/'sdkconfig').read_text().splitlines()
embedded = {}
for name in files:
    promoted = (stage/'tree'/name).read_bytes()
    original = subprocess.check_output(['git','show',base+':'+name])
    assert promoted in raw and original not in raw
    embedded[name]=digest(promoted)
products = {
    'esp-idf/main/natives/compositor.elf':'0b98db291f35a7da8534bc35cff95ea1a8aff1b1b5834a1505a16fa8286e69fe',
    'esp-idf/main/mobile-painter-slot.elf':'a89f0b5956392ed636cdd053e5c5f9c908053913fedd7b0cc41036f445ee418e',
    'esp-idf/main/typed-world-reactor.elf':'386a56b9e2ae4ff3e3bfb8f431ba315d5fb415b6ba29360b04e7d7e611c3837b',
    'esp-idf/main/chess.typed':'2a86ca2473b18beb30bf7a4d5990a55e8386f086a207cf24c19d43d7d620837c',
}
for key,value in products.items():
    artifact=(stage/'build'/key).read_bytes()
    assert digest(artifact)==value,key
    packed=stage/'build'/(key+'.z')
    if packed.is_file():
        import zlib
        data=packed.read_bytes()
        assert zlib.decompress(data[8:])==artifact and data in raw,key
    else:
        assert artifact in raw,key
out.update(revision=revision,controlFirmwareSHA256=control['application']['sha256'],applicationBytes=len(raw),
           factoryBytes=8*1024*1024,embeddedCompilers=embedded,identicalInputs=products,psramLoader=True)
a.output.parent.mkdir(parents=True,exist_ok=True)
a.output.write_text(json.dumps(out,indent=2)+'\n')
