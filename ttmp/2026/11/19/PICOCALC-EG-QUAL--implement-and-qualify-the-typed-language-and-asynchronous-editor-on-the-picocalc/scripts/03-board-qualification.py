"""Replay the professor's physical Editor workflow and preserve matched CPU and frame evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
OLD, = DAY.parent.glob("18/PICOCALC-TYPED-WORLDS--*/scripts/04-qualify-editor-on-p4.py")
MODULE = runpy.run_path(str(OLD))
BOARD = MODULE["BOARD"]
ENGINES = {"wasm": 1, "rv32": 2}


def write_json(path, value):
    temporary = path.with_suffix(".partial")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def validate(args):
    original = args.backup / "factory-original.bin"
    if original.stat().st_size != 8 * 1024 * 1024:
        raise ValueError("factory partition size mismatch")
    table = (args.backup / "partition-table.bin").read_bytes()
    for target in ENGINES:
        image = args.images / target
        partition = (image / "partition-table.bin").read_bytes()
        if partition.ljust(len(table), b"\xff") != table:
            raise ValueError(f"device partition map differs from {target} firmware")
        for kind in ("files","editor","agenda"):
            left = json.loads((args.images/"wasm"/f"system.typed-{kind}.json").read_text())
            right = json.loads((args.images/"rv32"/f"system.typed-{kind}.json").read_text())
            for manifest, engine in ((left, "wasm"), (right, "native")):
                editor, = (x for x in manifest["worlds"] if x["name"]=="editor")
                if editor.pop("engine") != engine or editor["file"]!="editor/compiled.bin":
                    raise ValueError("firmware selected a different Editor")
            if left != right:
                raise ValueError("firmware manifests differ outside the selected engine")
    if (args.images/"wasm/sdkconfig").read_bytes() != (args.images/"rv32/sdkconfig").read_bytes():
        raise ValueError("physical SDK configurations differ")
    return original


def worlds(text):
    records = [json.loads(x) for x in text.splitlines() if x.startswith('[{"name":')]
    apps = {x["name"]: {k:x[k] for k in ("engine","file","last_error")} for x in records[-1]
            if x["name"] in {"files","agenda","editor"}}
    if len(apps)!=3 or any(v["engine"]!="native" or v["last_error"] for v in apps.values()):
        raise ValueError(f"restoration failed: {apps}")
    return apps


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ("images","output","backup","esptool"):
        parser.add_argument("--"+name,type=Path,required=True)
    parser.add_argument("--port",default="/dev/ttyACM0")
    parser.add_argument("--kind",choices=["control","candidate","e5"],required=True)
    args=parser.parse_args()
    args.esptool_python=args.esptool.parent/"python"
    original=validate(args)
    parent=args.output
    parent.mkdir(parents=True,exist_ok=False)
    receipt=dict(original=hashlib.sha256(original.read_bytes()).hexdigest(),kind=args.kind,trials=[],restored=False)
    save=lambda:write_json(parent/"physical.json",receipt)
    save()
    capture=BOARD["capture"]

    def measured_capture(port, output, name, duration, commands, **kwargs):
        if name=="workflow":
            commands=["0.1 stats",*commands]
        return capture(port,output,name,duration,commands,**kwargs)
    BOARD["capture"]=measured_capture
    order=["wasm","rv32","rv32","wasm","wasm","rv32"]
    if args.kind=="candidate":
        order=list(reversed(order))
    if args.kind=="e5":
        order=["rv32"]
    try:
        for i,target in enumerate(order,1):
            root=parent/f"trial-{i}"
            root.mkdir()
            args.output=root
            if args.kind=="e5":
                BOARD["flash"](args,root,args.images/target/"picocalc-os-p4.bin",target)
                for b in range(3):
                    log=capture(args.port,root,f"boot-{b+1}",17,["0.5 reboot","14 worlds"])
                    sample=re.findall(r"editor compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)",log)
                    if not sample or "editor native compiler functions=streamed" not in log:
                        raise ValueError("missing native E5 compile")
                    us,peak,size=map(int,sample[-1])
                    receipt["trials"].append(dict(engine=target,us=us,peak=peak,bytes=size))
                    save()
                break
            row=MODULE["qualify"](args,target,ENGINES[target])
            workflow=(root/target/"workflow.log").read_text(errors="replace")
            cpu=[float(x) for x in re.findall(r"^\s+editor\s+app\s+\S+\s+\d+\s+([\d.]+)",workflow,re.M)]
            if len(cpu)!=2 or cpu[-1]<=cpu[0]:
                raise ValueError(f"expected starting and ending Editor counters, found {cpu}")
            row.update(trial=i,engine=target,workflow_cpu_ms=round(cpu[-1]-cpu[0],3))
            receipt["trials"].append(row)
            save()
    finally:
        BOARD["flash"](args,parent,original,"restore")
        receipt["worlds"]=worlds(capture(args.port,parent,"restored",18,["15 worlds"]))
        receipt["restored"]=True
        save()


if __name__=="__main__":
    main()
