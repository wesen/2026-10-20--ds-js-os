"""Measure repeated fresh Editor compiles from named physical firmware images, then restore factory."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy

HERE=Path(__file__).resolve().parent
METHOD=runpy.run_path(str(HERE/"03-board-qualification.py"))
BOARD=METHOD["BOARD"]


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ("output","backup","esptool"):
        p.add_argument("--"+name,type=Path,required=True)
    p.add_argument("--port",default="/dev/ttyACM0")
    p.add_argument("--lane",nargs=2,action="append",metavar=("NAME","RV32_FIRMWARE_DIRECTORY"),required=True)
    a=p.parse_args()
    a.esptool_python=a.esptool.parent/"python"
    original=a.backup/"factory-original.bin"
    table=(a.backup/"partition-table.bin").read_bytes()
    if original.stat().st_size!=8*1024*1024: raise ValueError("wrong factory backup length")
    configs=set()
    for name,directory in a.lane:
        if not re.fullmatch("[a-z0-9-]+",name): raise ValueError(name)
        image=Path(directory)
        if (image/"partition-table.bin").read_bytes().ljust(len(table),b"\xff")!=table:
            raise ValueError("partition table mismatch")
        configs.add((image/"sdkconfig").read_bytes())
        world,=(w for w in json.loads((image/"system.typed-editor.json").read_text())["worlds"] if w["name"]=="editor")
        if world["engine"]!="native" or world["file"]!="editor/compiled.bin": raise ValueError("wrong Editor target")
    if len(configs)!=1: raise ValueError("mismatched SDK configurations")
    parent=a.output
    parent.mkdir(parents=True,exist_ok=False)
    result=dict(original=hashlib.sha256(original.read_bytes()).hexdigest(),lanes={},restored=False)
    def save(): METHOD["write_json"](parent/"physical.json",result)
    save()
    try:
        for name,directory in a.lane:
            root=parent/name
            root.mkdir()
            image=Path(directory)/"picocalc-os-p4.bin"
            record=dict(image_sha256=hashlib.sha256(image.read_bytes()).hexdigest(),boots=[])
            result["lanes"][name]=record
            BOARD["flash"](a,root,image,name)
            for i in range(1,4):
                log=BOARD["capture"](a.port,root,f"boot-{i}",17,["0.5 reboot","14 worlds"])
                rows=re.findall(r"editor compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)",log)
                if not rows or "editor native compiler functions=streamed" not in log: raise ValueError(f"missing native {name} sample")
                us,peak,size=map(int,rows[-1])
                phases=[json.loads(x.split(" ",1)[1]) for x in log.splitlines() if x.startswith("eg_compile_phase_v1 ")]
                phases=[x for x in phases if x.get("app","editor")=="editor"]
                if name.startswith("phase-") and not phases: raise ValueError(f"missing phase markers at {name}")
                record["boots"].append(dict(us=us,peak=peak,bytes=size,phases=phases[-1:]));save()
    finally:
        BOARD["flash"](a,parent,original,"restore")
        result["worlds"]=METHOD["worlds"](BOARD["capture"](a.port,parent,"restored",18,["15 worlds"]))
        result["restored"]=True;save()


if __name__=="__main__":main()
