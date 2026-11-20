"""Reapply the measured compiler to a current clean checkout and replay all three existing apps."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[5]
STAGE,=(ROOT/"ttmp/2026/11/20").glob("PICOCALC-LEXICAL-INDEX--*/scripts/06-stage-firmware.py")
REPLAY,=HERE.parents[1].glob("PICOCALC-NATIVE-NEXT--*/scripts/01-run-host-replays.sh")
CSOURCES=("picocalc-os/port/esp32p4/main/typed_lex_index.c","picocalc-os/port/esp32p4/main/typed_lex_index.h")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ("wave","out","gcc","emulator"):p.add_argument(arg,type=Path)
    p.add_argument("lane",choices=["native-index-prepass","native-index-span"])
    p.add_argument("revision")
    a=p.parse_args()
    out=a.out.resolve()
    out.mkdir(parents=True,exist_ok=False)
    tree=out/"checkout"
    subprocess.run(["git","clone","--quiet","--shared","--no-checkout",ROOT,tree],check=True)
    subprocess.run(["git","-C",tree,"checkout","--quiet","--detach",a.revision],check=True)
    flags=["--reuse-token","--indexed-prepass"]
    if a.lane=="native-index-span":flags.append("--source-spans")
    measured=json.loads((a.wave/a.lane/"staged.json").read_text())
    actual=json.loads(subprocess.check_output(["python3","-B",STAGE,tree,*flags],text=True))
    cmake="picocalc-os/port/esp32p4/main/CMakeLists.txt"
    if actual.keys()!=measured.keys() or any(actual[k]!=measured[k] for k in actual if k!=cmake):
        raise ValueError("compiler or port source differs from the measured firmware")
    old=subprocess.check_output(["git","-C",tree,"show","HEAD:"+cmake],text=True)
    before="target_sources(${COMPONENT_LIB} PRIVATE typed_p4.c)"
    after="target_sources(${COMPONENT_LIB} PRIVATE typed_p4.c typed_lex_index.c)"
    if old.count(before)!=1 or (tree/cmake).read_text()!=old.replace(before,after):
        raise ValueError("CMake change extends beyond the typed compiler source list")
    subprocess.run(["git","-C",tree,"add","-N","--",*CSOURCES],check=True)
    patch=subprocess.check_output(["git","-C",tree,"diff","--binary","--",*actual])
    (out/"integration.patch").write_bytes(patch)
    subprocess.run(["cp","-a","--reflink=auto",ROOT/"picocalc-os/build",tree/"picocalc-os/build"],check=True)
    with (out/"replay.log").open("wb") as log:
        run=subprocess.run(["bash",REPLAY,a.gcc.resolve(),a.emulator.resolve()],cwd=tree,stdout=log,stderr=subprocess.STDOUT)
    rows=[l for l in (out/"replay.log").read_text().splitlines() if l.startswith(("PASS ","FAIL "))]
    receipt=dict(base=subprocess.check_output(["git","-C",tree,"rev-parse","HEAD"],text=True).strip(),
                 lane=a.lane,sources=actual,patch_sha256=hashlib.sha256(patch).hexdigest(),replays=rows,exit=run.returncode)
    (out/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
    if len(rows)!=24 or not all(l.startswith("PASS ") for l in rows) or run.returncode:
        raise RuntimeError("see replay.log")


if __name__=="__main__":main()
