"""Construct four frozen backends and a disposable ESP-IDF port using the production app wrappers."""
import argparse
import json
import hashlib
from pathlib import Path
import runpy
import shutil
import subprocess

here=Path(__file__).resolve().parent
day=here.parent.parent
repo=day.parents[3]
def ticket(name):
    only,=day.glob(name+"--*")
    return only
def replace(s, old, new):
    if s.count(old)!=1:
        raise ValueError(f"expected one occurrence of {old!r}")
    return s.replace(old,new)
def edit(p, old, new):
    p.write_text(replace(p.read_text(),old,new))
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

p=argparse.ArgumentParser(description=__doc__)
p.add_argument("work",type=Path)
work=p.parse_args().work.resolve()
work.mkdir(parents=True,exist_ok=True)
lanes=work/"lanes"
lanes.mkdir()
output=runpy.run_path(str(ticket("PICOCALC-RV32-OUTPUT")/"scripts/01-prepare.py"))
subprocess.run(["bash",ticket("PICOCALC-RV32-BRANCH")/"scripts/01-construct.sh",work/"pair"],check=True)
output["prepare"](lanes/"base","baseline",False)
output["prepare"](lanes/"compact","compact",False)
for lane in ["branch","both"]:
    shutil.copytree(lanes/"base",lanes/lane)
    p=lanes/lane/"typed/rv32.js"
    fused=(work/"pair/candidate/typed/rv32.js").read_text()
    p.write_text(fused if lane=="branch" else output["compact_backend"](fused,False))
assert digest(lanes/"base/typed/rv32.js")==digest(work/"pair/baseline/typed/rv32.js")
backends={name:digest(lanes/name/"typed/rv32.js") for name in ["base","branch","compact","both"]}
assert len(set(backends.values()))==4
for file in ("typed/wasm.js","typed/world.js","files/compile.js","agenda/compile.js"):
    assert len({digest(lanes/lane/file) for lane in backends})==1
(work/"compilers.json").write_text(json.dumps(backends,indent=2)+"\n")

tree=work/"tree"
tree.mkdir()
(tree/"ttmp").symlink_to(repo/"ttmp")
osdir=tree/"picocalc-os"
osdir.mkdir()
src=repo/"picocalc-os"
for child in src.iterdir():
    if child.name!="port" and not child.name.startswith("build"):
        (osdir/child.name).symlink_to(child)
original=src/"port/esp32p4"
port=osdir/"port/esp32p4"
port.mkdir(parents=True)
for name in ["main","optional","compiler","managed_components"]:
    shutil.copytree(original/name,port/name,symlinks=True)
for child in original.iterdir():
    if child.is_file():
        shutil.copyfile(child,port/child.name)
main=port/"main"
cmake=main/"CMakeLists.txt"
edit(cmake,"PRIV_REQUIRES driver","PRIV_REQUIRES mbedtls driver")
entries=[]
for i,lane in enumerate(backends):
    backend=lanes/lane/"typed/rv32.js"
    entries.extend([f'list(APPEND BUNDLE_EXTRA "lab/{i}.js={backend}")',f'list(APPEND BUNDLE_EXTRA_DEPS "{backend}")'])
entries.append('target_sources(${COMPONENT_LIB} PRIVATE combined_trials.c)')
key='set(BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/js_bundle.c)'
edit(cmake,key,'\n'.join(entries)+'\n'+key)
edit(main/"typed_p4.c",'#include "quickjs.h"','#include "quickjs.h"\nextern const char *joint_backend;')
edit(main/"typed_p4.c",'eval_file(ctx, "typed/rv32.js")','eval_file(ctx, joint_backend)')
edit(main/"editor_p4.c",'char *p4_editor_compile(','char *joint_editor_compile(')
with (main/"agenda_p4.c").open("a") as f:
    f.write('\nchar *joint_agenda_compile(size_t *length) {\n  vtime_t start;\n  return (char *)compile(false, length, &start);\n}\n')
shutil.copyfile(here/"02-trials.c",main/"combined_trials.c")
