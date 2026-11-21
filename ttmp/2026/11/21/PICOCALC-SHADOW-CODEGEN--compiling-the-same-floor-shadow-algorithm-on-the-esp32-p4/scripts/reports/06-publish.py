"""Stage both articles and a standalone executable workbook, preserving exact ticket source revisions."""
import argparse,json,re,subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument("vault",type=Path)
args=p.parse_args()
ticket=Path(__file__).resolve().parents[2]
repo=Path(subprocess.check_output(["git","rev-parse","--show-toplevel"],cwd=ticket,text=True).strip())
target=args.vault/"Projects/2026/11/21"
names=["ARTICLE - PicoCalc Shadows - From a Floor Shadow Ray to an ESP32-P4 Instruction Budget",
       "ARTICLE - PicoCalc Shadows - A Streaming Compiler for Guarded Integer Helpers"]
authors=["Lab director","Compiler researcher and coordinating implementer"]
def install(path,data):
    path.parent.mkdir(exist_ok=True,parents=True)
    if path.exists() and path.read_bytes()!=data: raise ValueError(f"existing artifact differs: {path}")
    path.write_bytes(data)
for i,tag in enumerate(["01","03"]):
    path,=(ticket/"analysis").glob(tag+"-*.md")
    rel=path.relative_to(repo)
    rev=subprocess.check_output(["git","log","-1","--format=%H","--",str(rel)],cwd=repo,text=True).strip()
    if not rev:raise ValueError(f"uncommitted manuscript: {path}")
    source=subprocess.check_output(["git","show",f"{rev}:{rel.as_posix()}"],cwd=repo)
    if source!=path.read_bytes(): raise ValueError(f"manuscript changes after commit: {path}")
    body=source.decode().split("\n---\n",1)[1].strip()
    def links(m):
        value=m[1].strip("<>")
        if value.startswith(("https:","http:","/","#")):return m[0]
        link,sep,anchor=value.partition("#")
        dest=(path.parent/link).resolve()
        if not dest.exists():raise ValueError(f"broken manuscript link: {dest}")
        return "](<"+str(dest)+(sep+anchor if sep else "")+">)"
    body=re.sub(r"\]\(([^)\n]+)\)",links,body)
    title=next(line[2:] for line in body.splitlines() if line.startswith("# "))
    front=["---","title: "+json.dumps(title),"tags: [project, picocalc, compiler, performance, research]",
           "type: article","created: 2026-11-21","ticket: PICOCALC-SHADOW-CODEGEN","status: complete",
           "research_author: "+json.dumps(authors[i]),"source_revision: "+rev,"source_path: "+str(rel),"---"]
    body+="\n\n## Reproduce the measurements\n\nThe [standalone shadow workbook](_assets/shadow-codegen/workbook.js) contains the captured trials and the analysis functions. Run it with Node to print the same study summary.\n\nCompanion chapter · [["+names[1-i]+"]]\n"
    install(target/(names[i]+".md"),("\n".join(front)+"\n\n"+body).encode())
rows=[json.loads(x) for x in (ticket/"various/board/final/rows.jsonl").read_text().splitlines()]
paths=json.loads((ticket/"various/board/paths.json").read_text())
script='"use strict";\nconst lab='+json.dumps(dict(rows=rows,paths=paths),separators=(",",":"))+';\n'
script+=(ticket/"scripts/reports/shadow.js").read_text()+'\nconsole.log(JSON.stringify(lab.score(),null,2));\n'
install(target/"_assets/shadow-codegen/workbook.js",script.encode())
