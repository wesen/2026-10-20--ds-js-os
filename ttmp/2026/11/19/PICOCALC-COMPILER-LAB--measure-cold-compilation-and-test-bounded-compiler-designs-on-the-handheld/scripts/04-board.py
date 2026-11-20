"""Run frozen, balanced compiler and pure guest comparisons and restore the factory partition."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
legacy, = (DAY.parent/"18").glob("PICOCALC-TYPED-APPS--*/scripts/06-qualify-files-on-p4.py")
shared = runpy.run_path(str(legacy))
combined, = DAY.glob("PICOCALC-RV32-COMBINED--*/scripts/06-board.py")
worlds = runpy.run_path(str(combined))["worlds"]
APPS = ("files", "agenda", "editor")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse(log, oracle, guest):
    names = list(oracle)
    n = len(names)
    expected = [(b,p,names[(b+(n-p if b//n else p))%n],app)
                for b in range(2*n) for p in range(n) for app in APPS]
    rows, cycles = [], {}
    current = None
    for line in log.splitlines():
        if line.startswith("LABRUN "):
            _, b, p, who, app = line.split()
            current_id = (int(b),int(p),who,app)
            if current or len(rows) == len(expected) or expected[len(rows)] != current_id:
                raise ValueError(f"unexpected measurement {line}")
            current = dict(block=int(b),position=int(p),lane=who,app=app)
        elif current and line == current["app"]+" native compiler functions=streamed":
            current["streamed"] = True
        elif current and line.startswith(current["app"]+" compile source="):
            m = re.fullmatch(r"\w+ compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)",line)
            if not m or "us" in current:
                raise ValueError(line)
            current["us"],current["peak"],current["bytes"] = map(int,m.groups())
        elif line.startswith("LABHASH "):
            _, who, app, digest = line.split()
            match = oracle[who][app]
            if (not current or current["lane"] != who or current["app"] != app or
                not current.get("streamed") or min(current["us"],current["peak"]) < 1 or
                current["bytes"] != match["bytes"] or digest != match["sha256"]):
                raise ValueError(f"bad physical compile {line} {current}")
            current.update(words=match["words"],sha256=digest)
            rows.append(current)
            current = None
        elif line.startswith("LABGUEST "):
            _, op, block, who, count, duration, hz = line.split()
            key = (op, int(block), who)
            if key in cycles or int(count) != 128 or int(duration)<=0 or int(hz)<=0:
                raise ValueError(line)
            cycles[key] = dict(op=op,block=int(block),lane=who,count=int(count),
                               cycles=int(duration),clock_hz=int(hz))
    complete = {(op,b,lane) for op in ("weekday","compare") for b in range(16) for lane in names}
    if current or len(expected)!=len(rows) or set(cycles)!=complete or "LABDONE" not in log.splitlines() or "LABFAIL" in log:
        raise ValueError(f"incomplete trial: {len(rows)}/{len(expected)} builds, {len(cycles)}/{len(complete)} guest batches")
    for who in names:
        for app in ("files","agenda"):
            if guest[who][app]["raw"] != oracle[who][app]["raw"]:
                raise ValueError("guest benchmark text differs from verified application")
    return dict(rows=rows,guest=list(cycles.values()),worlds=worlds(log))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work",type=Path)
    parser.add_argument("backup",type=Path)
    parser.add_argument("--port",required=True)
    parser.add_argument("--esptool",required=True,type=Path)
    parser.add_argument("--boots",type=int,default=2,choices=[1,2,3])
    args = parser.parse_args()
    work=args.work.resolve()
    backup=args.backup.resolve()
    args.esptool_python=args.esptool.parent/"python"
    subprocess.run(["node",HERE/"03-oracle.mjs",work],check=True)
    oracle=json.loads((work/"oracle.json").read_text())
    guest=json.loads((work/"guest.json").read_text())
    compilers=json.loads((work/"lanes.json").read_text())
    image=work/"build/picocalc-os-p4.bin"
    contents=image.read_bytes()
    table=(backup/"partition-table.bin").read_bytes()
    if (work/"build/partition_table/partition-table.bin").read_bytes().ljust(4096,b"\xff")!=table:
        raise ValueError("current and test partition maps differ")
    original=backup/"factory-original.bin"
    if original.stat().st_size!=8*1024*1024 or not 0<len(contents)<original.stat().st_size:
        raise ValueError("unexpected image size")
    for who, pair in compilers.items():
        for kind, digest in pair.items():
            js=(work/"lanes"/who/"typed"/(kind+".js")).read_bytes()
            if sha(js)!=digest or js not in contents:
                raise ValueError("compiler selection does not match firmware bytes")
    result=dict(firmware=sha(contents),table=sha(table),original=sha(original.read_bytes()),
                compilers=compilers,oracle=oracle,guest_inputs=guest,boots=[],restored=False)
    receipt=work/"physical.json"
    if receipt.exists():
        raise FileExistsError(receipt)
    def save():
        receipt.write_text(json.dumps(result,indent=2)+"\n")
    def capture(name,duration,commands):
        return shared["capture"](args.port,work,name,duration,commands)
    def flash(path,label):
        return shared["flash"](args,work,path,label)
    duration=round(18+8.2*len(compilers)**2)
    save()
    try:
        flash(image,"trial")
        for b in range(args.boots):
            commands=["0.4 reboot"] if b else []
            commands.append(str(duration-3)+" worlds")
            log=capture(f"boot-{b+1}",duration,commands)
            if b==0 and "LABRUN 0 0 base files" not in log:
                worlds(log)
                log=capture("boot-1-complete",duration,["0.4 reboot", commands[-1]])
            result["boots"].append(parse(log,oracle,guest))
            save()
    finally:
        flash(original,"restore")
        result["restored_worlds"]=worlds(capture("restored",17,["14 worlds"]))
        result["restored"]=True
        save()


if __name__ == "__main__":
    main()
