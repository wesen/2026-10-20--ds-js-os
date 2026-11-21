"""Stage only frozen compiler-study material for an Opus High author; print the directory."""
from pathlib import Path
from tempfile import mkdtemp
import hashlib, gzip, json, re, shutil, subprocess

here = Path(__file__).resolve().parent
repo = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
day = repo / "ttmp/2026/11/21"
row = next(day.glob("PICOCALC-ROW-IR--*"))
pie = next(day.glob("PICOCALC-PIE-LOOPS--*"))
repl = next(day.glob("PICOCALC-TRACE-REPL--*"))
vault = Path.home() / "code/wesen/go-go-golems/go-go-parc/Projects/2026/11/21"
skills = Path.home() / ".codex/skills"
stage = Path(mkdtemp(prefix="picocalc-opus-high-evidence-"))
refs = []
def add(path, name=None):
    filename = name or path.name
    shutil.copyfile(path, stage / filename)
    refs.append((filename, str(path.relative_to(repo)) if path.is_relative_to(repo) else str(path)))
def dump(obj, p):
    p.write_text(json.dumps(obj, indent=2) + "\n")

add(here / "evidence-scientist.md", "brief.md")
for name in ("ARTICLE - Playbook - Persona Sessions with Agents - Improving Software and APIs from Usability Reports.md",
             "ARTICLE - Playbook - Improving an Agent-Facing JavaScript API with Persona Runs - Lessons from homolog-bench.md"):
    add(vault / name)
for p, n in [(skills/"diary/references/investigation-entry.md","diary-format.md"),
             (skills/"textbook-authoring/SKILL.md","textbook.md"),
             (skills/"obsidian-vault-writing/SKILL.md","vault-style.md")]:
    add(p,n)
for name in ("01-row.c", "02-passes.py","03-fixtures.mjs","05-execute.py","07-typed-counts.mjs","09-archive-llvm.py","10-read-pass.py"):
    add(row/"scripts"/name)
for name in ("06-board.py","09-paired-results.py"):
    add(pie/"scripts"/name)
for name in ("typed-counts.json","execution.json","pass-metrics.json"):
    add(row/"various/passes"/name)
for name in ("images.json","build.json","loads.json"):
    add(pie/"various/device"/name)
add(repl/"reference/03-archive-diary.md","host-verification.md")
add(pie/"analysis/01-what-an-inferred-packed-subtraction-buys-on-the-esp32-p4.md","physical-report.md")
add(row/"analysis/01-from-checked-halfwords-to-a-native-row-loop-in-gcc-and-llvm.md","c-and-typed-report.md")
raw = (pie/"various/device/rows.json").read_bytes()
rows=json.loads(raw)
indexed=[{"index":i,**r} for i,r in enumerate(rows) if r["fixture"]=="default"]
arm = {0:"stock",8:"scalar",5:"pie"}
event_source=row/"various/llvm-pipeline"
stream=gzip.decompress((event_source/"checked-middle.log.gz").read_bytes())
idx=json.loads(gzip.decompress((event_source/"checked-middle.index.json.gz").read_bytes()))
witness={}
for i in (73,74):
    start,end=idx[i]["offset"],idx[i+1]["offset"]
    body=stream[start:end].decode()
    (stage/f"llvm-dump-{i}.txt").write_text(body)
    region=re.search(r"^define [^\n]*@row\(.*?^}",body,re.M|re.S)[0]
    witness[i]={"sha256":hashlib.sha256(stream).hexdigest(),"start":start,"end":end,"bytes":end-start,
                "header":idx[i]["header"],"directI32HeaderLoadSites":region.count("load i32, ptr %work,")}
timing={(r["block"],r["program"]):r for r in indexed}
physical=[]
for b in range(6):
    physical.append({"block":b, **{arm[k]:{"rowIndex":timing[b,k]["index"],"cleanUs":timing[b,k]["timesUs"][2][0]}
                                  for k in (0,8,5)}})
dump({"middle":witness,"opening":physical,"rowsSHA256":hashlib.sha256(raw).hexdigest(),
      "openingRawRows":indexed},stage/"w-full-fixture.json")
rev = subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()
refs += [("raw rows",str((pie/"various/device/rows.json").relative_to(repo))),
         ("Byte citations use this exact original",str((event_source/"checked-middle.log.gz").relative_to(repo))),
         ("hardware timer code","picocalc-os/port/esp32p4/main/typed_ray_p4.c"),
         ("typed renderer","picocalc-os/worlds/raytrace/raytrace.typed"),
         ("project prompt, including verbatim request",str((repl/"reference/01-supervisor-investigation-diary.md").relative_to(repo)))]
(stage/"source-map.md").write_text("# Source map\n\nRepository https://github.com/wesen/2026-10-20--ds-js-os . Frozen revision "+rev+". Use repo-relative paths for project citations; do not cite the staging directory.\n\n"+"\n".join(f"- {k}: {v}" for k,v in refs)+"\n")
print(stage)
