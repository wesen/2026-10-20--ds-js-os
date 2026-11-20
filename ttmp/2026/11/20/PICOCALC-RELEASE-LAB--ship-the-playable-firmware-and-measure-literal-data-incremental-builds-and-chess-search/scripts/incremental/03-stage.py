"""Build the current compiler unchanged and a private fragment-aware variant."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil

here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if (p/'.git').is_dir())
parser=argparse.ArgumentParser()
parser.add_argument('out',type=Path)
parser.add_argument('release_main',type=Path,help='qualified CMake build/esp-idf/main')
args=parser.parse_args()
args.out.mkdir(exist_ok=True,parents=True)
source=repo/'picocalc-os/compiler'
files=('typed-wasm.js','typed-async.js','typed-rv32.js','typed-world.js')
def sub(text,a,b,n):
    assert text.count(a)==n,(a,text.count(a),n)
    return text.replace(a,b)
for name in files:
    text=(source/name).read_text()
    (args.out/name).write_text(text)
    if name=='typed-wasm.js':
        a='    if (onSignatures) onSignatures(functions);'
        b=a+'''
    const fragments = onFunction && globalThis.activeFragments;
    if (fragments) fragments.init(imported,functions,records,enums,distinct,lowered);'''
        text=sub(text,a,b,2)
        a='new Emitter(lex, declared, records, edges[i], functionBase, enums, distinct).function(fn);'
        text=sub(text,a,'if (!fragments || !fragments.lookup(lex,fn,edges[i])) '+a,2)
    if name=='typed-rv32.js':
        a='function lower(fn) { code.push(new FunctionCode(fn, callables, targets).lower()); }'
        b='''function lower(fn) {
        const build = () => new FunctionCode(fn,callables,targets).lower();
        code.push(globalThis.activeFragments ? globalThis.activeFragments.lower(fn,targets,build) : build());
    }'''
        text=sub(text,a,b,1)
    (args.out/('candidate-'+name)).write_text(text)
for dest,src in [('chess.typed','chess.typed'),('editor.typed','editor.typed'),('chess.elf','typed-chess-3d-reactor.elf'),('editor.elf','typed-world-reactor.elf')]:
    shutil.copyfile(args.release_main/src,args.out/dest)
files=list(files)+['candidate-'+x for x in files]+['editor.typed','chess.typed','editor.elf','chess.elf']
dig={name:sha256((args.out/name).read_bytes()).hexdigest() for name in files}
dig['02-fragments.js']=sha256((here/'02-fragments.js').read_bytes()).hexdigest()
(args.out/'identity.json').write_text(json.dumps(dig,indent=2)+'\n')
