"""Build a standalone P4 trial with exact source, reactor and clean CRC oracles."""
import json
import shutil
from pathlib import Path
import sys
import zlib
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if (p/'.git').is_dir())
stage,out=map(Path,sys.argv[1:])
shutil.copytree(here/'board',out,dirs_exist_ok=True)
main=out/'main'
quick=repo/'picocalc-os/third_party/quickjs'
for ext in ('*.h','quickjs.c','libregexp.c','libunicode.c','cutils.c','dtoa.c','VERSION'):
    for p in quick.glob(ext): shutil.copyfile(p,main/p.name)
shutil.copyfile(repo/'picocalc-os/port/esp32p4/partitions.csv',out/'partitions.csv')
defs=next((here.parents[2]).glob('PICOCALC-RASTER-PIE--*'))/'scripts/board/sdkconfig.defaults'
(out/'sdkconfig.defaults').write_text(defs.read_text()+'\nCONFIG_FATFS_SECTOR_4096=y\nCONFIG_FATFS_LFN_HEAP=y\nCONFIG_WL_SECTOR_SIZE_4096=y\nCONFIG_ESP_TASK_WDT_INIT=n\nCONFIG_ESP_MAIN_TASK_STACK_SIZE=65536\n')
for f in ('typed_lex_index.c','typed_lex_index.h','p4_compat.h'):
    shutil.copyfile(repo/'picocalc-os/port/esp32p4/main'/f,main/f)
payloads={'helper':(here/'02-fragments.js').read_bytes()}
for name, prefix in [('stock',''),('candidate','candidate-')]:
    chunks=[(stage/(prefix+n)).read_bytes() for n in ('typed-wasm.js','typed-async.js','typed-rv32.js','typed-world.js')]
    if name=='stock':
        # Preserve all four globals through capture: the stock wrapper resolves typedRv32 dynamically.
        tail=b'\n;globalThis.stockGlobals=[typedWasm,typedAsync,typedRv32,compileTypedWorldRv32];'
    else:
        tail=b'\n;globalThis.candidateGlobals=[typedWasm,typedAsync,typedRv32,compileTypedWorldRv32];'
    payloads[name]=b'\n'.join(chunks)+tail
for app in ('editor','chess'):
    for ext in ('typed','elf'):payloads[app+'_'+ext]=(stage/(app+'.'+ext)).read_bytes()
identity=__import__('hashlib').sha256((stage/'identity.json').read_bytes()).hexdigest()
payloads['session']=('globalThis.fragmentBuildIdentity="'+identity+'";\n').encode()+(here/'02-fragments.js').read_bytes()+(here/'04-edits.js').read_bytes()+(here/'06-board.js').read_bytes()
payloads['gold']=(stage/'gold.json').read_bytes()
with (main/'payload.S').open('w') as f:
    for name,data in payloads.items():
        p=main/(name+'.bin');p.write_bytes(data)
        print('.section .rodata\n.balign 4\n.global {0}_start,{0}_end\n{0}_start:\n.incbin "{1}"\n{0}_end:\n.byte 0'.format(name,p.resolve()),file=f)
