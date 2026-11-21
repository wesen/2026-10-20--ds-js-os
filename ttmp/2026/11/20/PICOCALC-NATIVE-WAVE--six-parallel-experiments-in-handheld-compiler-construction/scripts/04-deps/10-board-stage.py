"""Reuse the previously qualified QuickJS/IDF app shell. Rebuild the three exact compiler payloads."""
import sys,subprocess,shutil
from pathlib import Path
here=Path(__file__).resolve().parent
old=next(here.parents[2].glob('PICOCALC-RELEASE-LAB--*'))/'scripts/incremental'
stage,out=map(Path,sys.argv[1:])
subprocess.run(['node',str(old/'08-gold.mjs'),str(stage)],check=True)
subprocess.run([sys.executable,str(old/'07-board-stage.py'),str(stage),str(out)],check=True)
main=out/'main'
names=['typed-wasm.js','typed-async.js','typed-rv32.js','typed-world.js']
def bundle(pre):return b'\n'.join((stage/(pre+n)).read_bytes() for n in names)
helper=(here/'03-session.js').read_bytes()+b'\n;globalThis.fragmentSession=dependencySession;'
(main/'helper.bin').write_bytes(helper)
(main/'candidate.bin').write_bytes(bundle('selective-')+b'\n;globalThis.candidateGlobals=[typedWasm,typedAsync,typedRv32,compileTypedWorldRv32];')
(main/'session.bin').write_bytes(bundle('candidate-')+b'\n;globalThis.globalCacheGlobals=[typedWasm,typedAsync,typedRv32,compileTypedWorldRv32];\n'+(old/'02-fragments.js').read_bytes()+(here/'03-session.js').read_bytes()+(old/'04-edits.js').read_bytes()+(here/'09-board.js').read_bytes())
p=main/'trial.c';s=p.read_text()
a=s.index('    const esp_vfs_fat_mount_config_t cfg=')
b=s.index('    printf("INC_DONE',a)
s=s[:a]+'''    puts("INC_BEGIN precise dependencies; no filesystem access");
    bool ok=cold(false,false)&&cold(false,true)&&cold(true,false)&&cold(true,true)&&run(false)&&run(true);
'''+s[b:];p.write_text(s)
