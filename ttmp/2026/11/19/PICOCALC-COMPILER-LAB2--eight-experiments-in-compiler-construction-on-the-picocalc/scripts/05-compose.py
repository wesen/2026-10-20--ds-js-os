"""Combine the frozen frontend and native research passes in an isolated compiler trial."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent


def script(ticket, name):
    result, = DAY.glob(ticket + "--*/scripts/" + name)
    return result


def stage(work, native, a7, staged, source_decoder):
    work.mkdir(parents=True,exist_ok=True)
    lab=runpy.run_path(str(script("PICOCALC-COMPILER-LAB","01-stage.py")))
    front=runpy.run_path(str(script("PICOCALC-FRONTEND-FACTORIAL","01-stage.py")))
    composition=work/"inputs"/"combined"/"typed"
    base=work/"inputs"/"production"/"typed"
    base.mkdir(parents=True);composition.mkdir(parents=True)
    source=(native/"typed/wasm.js").read_text()
    scanner=front["cursor"](front["regex_reused"](source),"reuse")
    if source_decoder!="cursor_reuse": raise ValueError(source_decoder)
    (composition/"wasm.js").write_text(scanner)
    shutil.copyfile(native/"typed/rv32.js",composition/"rv32.js")
    for part in ("wasm","rv32","world"):
        content=lab["frozen"]("picocalc-os/compiler/typed-"+part+".js")
        (base/(part+".js")).write_bytes(content)
    shutil.copyfile(base/"world.js",composition/"world.js")
    lanes={"base":base.parent,"staged":staged,"native":native,"combined":composition.parent}
    runpy.run_path(str(script("PICOCALC-CONDITION-TARGETS","04-stage-board.py")))["stage"](work,lanes)
    subprocess.run(["node",script("PICOCALC-REGISTER-LOCALS","05-editor-guest.mjs"),work,a7],check=True)
    main=work/"tree/picocalc-os/port/esp32p4/main"
    app=main/"lab_trials.c"
    text=app.read_text()
    marker="char *p4_editor_compile(size_t *length)"
    gate='if (!guest()) { puts("LABFAIL guest"); return NULL; }'
    if text.count(marker)!=1 or text.count(gate)!=1: raise ValueError("guest driver changed")
    text=text.replace(marker,script("PICOCALC-REGISTER-LOCALS","06-editor-guest.c").read_text()+"\n"+marker)
    app.write_text(text.replace(gate,gate.replace("!guest()","!guest() || !editor_guest()")))
    receipt={"decoder":source_decoder,"inputs":{
        name:{part:hashlib.sha256((lane/"typed"/(part+".js")).read_bytes()).hexdigest() for part in ("wasm","rv32")}
        for name,lane in lanes.items()}}
    (work/"combination.json").write_text(json.dumps(receipt,indent=2)+"\n")


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    for arg in ("work","native","a7","staged"):
        parser.add_argument(arg,type=Path)
    args=parser.parse_args()
    stage(args.work.resolve(),args.native.resolve(),args.a7.resolve(),args.staged.resolve(),"cursor_reuse")
