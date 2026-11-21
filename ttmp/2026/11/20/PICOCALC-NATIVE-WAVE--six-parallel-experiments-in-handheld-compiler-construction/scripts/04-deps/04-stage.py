"""Construct two private release backends. All tracked semantic lookups are scoped to one emitter."""
from pathlib import Path
import subprocess,sys,shutil,hashlib,json
here=Path(__file__).resolve().parent
old=next(here.parents[2].glob('PICOCALC-RELEASE-LAB--*'))/'scripts/incremental'
out,release=map(Path,sys.argv[1:])
subprocess.run([sys.executable,str(old/'03-stage.py'),str(out),str(release)],check=True)
anchor='new Emitter(lex, declared, records, edges[i], functionBase, enums, distinct).function(fn);'
src=(out/'candidate-typed-wasm.js').read_text()
assert src.count(anchor)==2
text=src.replace(anchor,'{ if (fragments?.emit) fragments.emit(Emitter,lex,declared,records,edges[i],functionBase,enums,distinct,fn); else '+anchor+' }')
(out/'selective-typed-wasm.js').write_text(text)
for f in ('typed-async.js','typed-rv32.js','typed-world.js'):shutil.copyfile(out/('candidate-'+f),out/('selective-'+f))
for f in ('02-fragments.js','04-edits.js'):shutil.copyfile(old/f,out/f)
shutil.copyfile(here/'03-session.js',out/'03-session.js')
(out/'selective-identities.json').write_text(json.dumps({f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.iterdir()) if f.suffix in ('.js','.elf','.typed')},indent=2)+'\n')
