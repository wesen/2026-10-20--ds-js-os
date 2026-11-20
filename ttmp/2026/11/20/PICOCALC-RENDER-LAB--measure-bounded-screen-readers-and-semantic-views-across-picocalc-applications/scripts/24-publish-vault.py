"""Append reviewed articles and their original evidence figures to the go-go-parc vault."""
import argparse,hashlib,re,subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('vault',type=Path);p.add_argument('articles',nargs='+',type=Path)
p.add_argument('--push',action='store_true');a=p.parse_args()
day=a.vault/'Projects/2026/11/20';assets=day/'_assets'
day.mkdir(parents=True,exist_ok=True);assets.mkdir(exist_ok=True)
git=['git','-C',str(a.vault)]
assert subprocess.check_output(git+['branch','--show-current'],text=True).strip()=='main'
paths=[]
def append(path,data):
    if path.exists() and path.read_bytes()!=data:raise ValueError(f'Existing note differs: {path}')
    if not path.exists():path.write_bytes(data)
    paths.append(str(path.relative_to(a.vault)))
for article in a.articles:
    content=article.read_text().split('\n---\n',1)[1].strip()
    title=next(line.removeprefix('# ').strip() for line in content.splitlines() if line.startswith('# '))
    for rel in re.findall(r'!\[[^\]]*\]\((\.\./various/[^ ()]+)\)',content):
        f=article.parent/rel
        append(assets/f.name,f.read_bytes());content=content.replace('('+rel+')','(_assets/'+f.name+')')
    name='ARTICLE - PicoCalc Rendering - '+title.rstrip('?').replace(':',' -')+'.md'
    header='---\ntitle: "'+title.replace('"','\\"')+'"\naliases: []\ntags: [article, picocalc, rendering, esp32-p4]\ncreated: 2026-11-20\ntype: project-report\nstatus: complete\n---\n\n'
    append(day/name,(header+content+'\n').encode())
subprocess.run(git+['add','--',*paths],check=True)
subprocess.run(git+['diff','--cached','--check','--',*paths],check=True)
changed=subprocess.run(git+['diff','--cached','--quiet','--',*paths]).returncode
if changed==1:
    subprocess.run(git+['commit','--only','-m','Publish measured PicoCalc renderer research','--',*paths],check=True)
elif changed!=0:raise RuntimeError('git diff failed')
if a.push:
    subprocess.run(git+['push','origin','HEAD:main'],check=True)
    local=subprocess.check_output(git+['rev-parse','HEAD'],text=True).strip()
    remote=subprocess.check_output(git+['ls-remote','origin','refs/heads/main'],text=True).split()[0]
    if local!=remote:raise RuntimeError('remote ref differs from published ref')
    for rel in paths:subprocess.run(git+['cat-file','-e',remote+':'+rel],check=True)
    print('Verified origin/main',remote)
for rel in paths:print(rel)
