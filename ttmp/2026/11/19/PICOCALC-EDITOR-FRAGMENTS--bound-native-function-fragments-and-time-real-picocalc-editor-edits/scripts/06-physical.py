"""Measure every Editor edit through a verified native return and restore the board."""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import time

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
legacy, = (DAY.parent / "18").glob("PICOCALC-TYPED-APPS--*/scripts/06-qualify-files-on-p4.py")
combined, = DAY.glob("PICOCALC-RV32-COMBINED--*/scripts/06-board.py")
shared = runpy.run_path(str(legacy))
worlds = runpy.run_path(str(combined))["worlds"]
KEYS = "round position mode edit us load_us guest_us before peak size retained word_bytes built reused ret cell0 cell1 rows units columns".split()
BUDGET = [0, 262144, 40960]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse(log, oracle):
    rows=[]
    for line in log.splitlines():
        if line.startswith("FRAGERROR") or line=="FRAGFAIL":
            raise ValueError(line)
        if not line.startswith("FRAGROW "):
            continue
        fields=line.split()
        if len(fields)!=len(KEYS)+2:
            raise ValueError(line)
        r=dict(zip(KEYS,map(int,fields[1:-1])))
        r["sha256"]=fields[-1]
        idx=len(rows)
        turn,inner=divmod(idx,12)
        edit,pos=divmod(inner,3)
        mode=(turn+pos+edit)%3
        check=oracle["rows"][edit+1]
        if [r[key] for key in ("round","position","mode","edit")]!=[turn,pos,mode,edit]:
            raise ValueError("wrong run order")
        if r["size"]!=check["bytes"] or r["sha256"]!=check["elf"]:
            raise ValueError("clean ELF mismatch")
        if [r[k] for k in ("ret","cell0","cell1","rows","units","columns")]!=[0,5,4,3,0,0]:
            raise ValueError("wrong guest result")
        if not 0<r["before"]<=r["peak"] or not 0<r["load_us"]<r["us"] or r["built"]+r["reused"]!=120:
            raise ValueError("bad timing/retention accounting")
        if mode:
            expected=oracle["caps"][str(BUDGET[mode])][edit+1]
            if [r[k] for k in ("retained","word_bytes","built","reused")]!=[expected[k] for k in ("count","bytes","built","reused")]:
                raise ValueError("physical fragment counts differ from host")
        rows.append(r)
    if "FRAGDONE" not in log.splitlines() or len(rows)!=36:
        raise ValueError(f"incomplete Editor trial: {len(rows)} rows")
    return {"rows":rows,"worlds":worlds(log)}


def capture_to_completion(args,work,which,reboot):
    import serial
    with serial.Serial(args.port,115200,timeout=.3) as port, (work/(which+".log")).open("wb") as log:
        if reboot:
            time.sleep(.25)
            port.write(b"\nreboot\n")
        combined=bytearray()
        end=time.monotonic()+300
        ask_worlds=None
        while time.monotonic()<end:
            line=port.readline()
            if line:
                log.write(line)
                log.flush()
                combined.extend(line)
                if b"FRAGFAIL" in line or b"FRAGERROR" in line:
                    raise ValueError(line.decode(errors="replace"))
                if b"FRAGDONE" in line:
                    ask_worlds=time.monotonic()+14
            if ask_worlds is not None and time.monotonic()>=ask_worlds:
                port.write(b"\nworlds\n")
                ask_worlds=time.monotonic()+4
            if ask_worlds and b"#OK worlds" in combined[-800:]:
                break
    return bytes(combined).decode(errors="replace").replace("\r\n","\n")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("work",type=Path);p.add_argument("backup",type=Path)
    p.add_argument("--port",required=True);p.add_argument("--esptool",type=Path,required=True)
    args=p.parse_args()
    args.esptool_python=args.esptool.parent/"python"
    work=args.work.resolve()
    main=work/"build/esp-idf/main"
    staged=(work/"editor-oracle.h").read_bytes()
    subprocess.run(["node",HERE/"03-oracle.mjs",work,main/"editor.typed",main/"typed-world-reactor.elf"],check=True)
    if (work/"editor-oracle.h").read_bytes()!=staged:
        raise ValueError("firmware guest offsets differ from actual input-derived oracle")
    oracle=json.loads((work/"host.json").read_text())
    img=work/"build/picocalc-os-p4.bin"
    data=img.read_bytes()
    if (work/"build/partition_table/partition-table.bin").read_bytes().ljust(4096,b"\xff")!=(args.backup/"partition-table.bin").read_bytes():
        raise ValueError("partition map mismatch")
    required=["stock/wasm.js","stock/rv32.js","stock/world.js","candidate/wasm.js","candidate/world.js",
              "candidate/rv32.js","candidate/incremental.js","candidate/endpoint.js"]
    manifest=json.loads((work/"sources.json").read_text())
    for name in required:
        src=(work/name).read_bytes()
        if src not in data or sha(src)!=manifest[name]:
            raise ValueError(name)
    original=args.backup/"factory-original.bin"
    if not 0<img.stat().st_size<original.stat().st_size==8388608:
        raise ValueError("invalid backup/image bounds")
    receipt=work/"physical.json"
    if receipt.exists(): raise FileExistsError(receipt)
    res=dict(firmware=sha(data),factory=sha(original.read_bytes()),compilers={n:manifest[n] for n in required},boots=[],restored=False)
    def save(): receipt.write_text(json.dumps(res,indent=2)+"\n")
    with (args.backup/"serial.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        save()
        try:
            shared["flash"](args,work,img,"trial")
            for n in range(2):
                log=capture_to_completion(args,work,"fragments-"+str(n+1),bool(n))
                res["boots"].append(parse(log,oracle))
                save()
        finally:
            shared["flash"](args,work,original,"restore")
            res["restored_worlds"]=worlds(shared["capture"](args.port,work,"restored",17,["14 worlds"]))
            res["restored"]=True
            save()


if __name__=="__main__":
    main()
