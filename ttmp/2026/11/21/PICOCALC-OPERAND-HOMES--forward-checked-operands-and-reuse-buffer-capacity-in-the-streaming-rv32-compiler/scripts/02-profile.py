"""Reuse the reviewed full-frame interpreter with per-PC counts for the five policy arms."""
from pathlib import Path
import subprocess,sys
t=Path(__file__).resolve().parents[1]
old=next(t.parent.glob('PICOCALC-SHADOW-CODEGEN--*'))
base=(old/'scripts/compile/02-profile.mjs').read_text()
work=Path(sys.argv[1]).resolve();work.mkdir(parents=True,exist_ok=True)
dir=t/'various/profiles';dir.mkdir(parents=True,exist_ok=True)
for mode,policy in [('control','{}'),('forward','{forward:true}'),('capacity','{capacity:true}'),('both','{forward:true,capacity:true}'),('homes','{forward:true,capacity:true,homes:true}')]:
 s=base.replace("if(mode!=='baseline')options.inlineGuardedReturns=mode==='general'?true:name=>name===shadow;", "options.inlineGuardedReturns=true;options.operandLocations="+policy+";")
 s=s.replace("shadowCounts.steps+=n;","shadowCounts.steps+=n; if(op===3 && ((w>>>12)&7)===2 && ((w>>>15)&31)!==2) shadowCounts.capacityLoads=(shadowCounts.capacityLoads??0)+n;")
 (work/'profile.mjs').write_text(s)
 subprocess.run(['node',work/'profile.mjs','general',dir/(mode+'.json'),sys.argv[2]],check=True)
