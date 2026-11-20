"""Correct a table caption in this wave's own freshly published article."""
import subprocess,sys
from pathlib import Path
vault=Path(sys.argv[1]);rel=Path('Projects/2026/11/20/ARTICLE - PicoCalc Rendering - What a Bounded Screen Reader Retains.md')
p=vault/rel;git=['git','-C',str(vault)]
text=p.read_text()
control=subprocess.check_output(git+['show','f6350ad:'+str(rel)],text=True)
assert text==control,'Refuse to modify independent changes to this article'
p2=next((Path(__file__).resolve().parent.parent/'analysis').glob('01-*'))
body=p2.read_text().split('\n---\n',1)[1].strip()
p.write_text(text.split('\n---\n',1)[0]+'\n---\n\n'+body+'\n')
subprocess.run(git+['add','--',rel],check=True)
subprocess.run(git+['diff','--cached','--check','--',rel],check=True)
subprocess.run(git+['commit','--only','-m','Identify node-width measurement calls in the renderer study','--',rel],check=True)
