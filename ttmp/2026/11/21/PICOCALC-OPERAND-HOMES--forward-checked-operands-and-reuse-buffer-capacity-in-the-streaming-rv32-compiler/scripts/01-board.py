"""Stage the established paired shadow benchmark with five native compile policies."""
from pathlib import Path
import json,shutil,subprocess,sys
ticket=Path(__file__).resolve().parents[1]
old=next(ticket.parent.glob('PICOCALC-SHADOW-CODEGEN--*'))
src=old/'scripts/board'
build=Path(sys.argv[1]).resolve()
stage=build/'study';stage.mkdir(parents=True,exist_ok=True)
base=(src/'01-images.mjs').read_text().replace('../validation/holdout.mjs',(old/'scripts/validation/holdout.mjs').as_uri())
a=base.index('const here=');b=base.index('const out=',a)
base=base[:a]+'const ticket='+json.dumps(str(old))+', root='+json.dumps(str(ticket.parents[4]))+';\n'+base[b:]
a=base.index('const opts=');b=base.index('const asm=',a)
policies=[{},dict(forward=True),dict(capacity=True),dict(forward=True,capacity=True),dict(forward=True,capacity=True,homes=True)]
opts=['('+json.dumps(dict(pieLoops='pie-empty',inlineGuardedReturns=True,**({'operandLocations':v} if v else {})))+')' for v in policies]
base=base[:a]+'const opts='+json.dumps(opts)+';\n'+base[b:]
(stage/'01-images.mjs').write_text(base.replace('9a4a2356a86beee281fb79dcc199bc2369b819ef9b0a5f5c28d444ff4719f26f','c31e75ee3817542fa31e0466bacb712814e018da084cd2f420abb7fe2993037e'))
for f in ['bench.c','layout.inc','cold.c','02-build.sh']:shutil.copy(src/f,stage/f)
subprocess.run(['bash',stage/'02-build.sh',build],check=True)
