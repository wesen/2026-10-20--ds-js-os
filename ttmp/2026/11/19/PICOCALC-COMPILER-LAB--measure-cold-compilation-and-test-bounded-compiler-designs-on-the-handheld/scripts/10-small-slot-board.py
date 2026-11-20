"""Boot the named Editor compiler, verify its returned module and exercise a real 64 KiB document."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys

HERE = Path(__file__).resolve().parent
LIB = runpy.run_path(str(HERE/"04-board.py"))
DAY = HERE.parent.parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def observe(log, expected_bytes, digest=None):
    LIB["worlds"](log)
    worlds_line=next(line for line in log.splitlines() if line.startswith('[{"name":'))
    editor=next(item for item in json.loads(worlds_line) if item["name"]=="editor")
    measurement=re.findall(r"editor compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)",log)
    if len(measurement)!=1:
        raise ValueError(f"expected one boot-time Editor compile: {measurement}")
    us,peak,size=map(int,measurement[0])
    if not (size==expected_bytes and us>0 and peak>0):
        raise ValueError(measurement)
    if digest and not re.search(rf"^(?:SLOT80|LIVE) editor bytes={size} sha256={digest}$", log, re.MULTILINE):
        raise ValueError("missing post-compile module digest")
    return dict(elapsed_us=us,peak_js_bytes=peak,module_bytes=size,compiled_sha256=digest,
                world_kib=editor["mem_kb"],world_limit_kib=editor["limit_kb"],engine=editor["engine"])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage",type=Path)
    parser.add_argument("backup",type=Path)
    parser.add_argument("output",type=Path)
    parser.add_argument("--select", action="store_true", help="qualify the Select compiler in the production-sized reservation")
    parser.add_argument("--port",required=True)
    parser.add_argument("--esptool",type=Path,required=True)
    parser.add_argument("--firmware-sha",required=True)
    parser.add_argument("--backup-sha",required=True)
    args=parser.parse_args()
    args.esptool_python=args.esptool.parent/"python"
    image=args.stage/"build/picocalc-os-p4.bin"
    backup=args.backup/"factory-original.bin"
    assert sha(image)==args.firmware_sha and sha(backup)==args.backup_sha and backup.stat().st_size==0x800000
    if args.select:
        oracle=json.loads((args.stage/"editor-oracle.json").read_text())
        size,digest=oracle["bytes"],oracle["sha256"]
        assert size==240452 and digest=="06a85ff63c94a9d193a9136f92a2250e6725c5f9df830e9c00aa643d96503944"
        binary=image.read_bytes()
        for source in (args.stage/"lanes/select/typed").glob("*.js"):
            assert source.read_bytes() in binary
        label="select"
    else:
        elf=args.stage/"editor-small.elf"
        size,digest=elf.stat().st_size,sha(elf)
        assert size==92996 and digest=="81718435b1d83e79cd8ad11d3f3260aa7978d6eb081cf0a42f9491d112c67bb4"
        label="small-slot"
    assert (args.backup/"partition-table.bin").read_bytes()==(args.stage/"build/partition_table/partition-table.bin").read_bytes().ljust(4096,b"\xff")
    args.output.mkdir()
    result={"candidate":label,"firmware_sha256":sha(image),"boots":[],"restored":False}
    def save():
        (args.output/"physical.json").write_text(json.dumps(result,indent=2)+"\n")
    def boot(label):
        return LIB["shared"]["capture"](args.port,args.output,label,18,["0.3 reboot","15 worlds"])
    result["control_before"]=observe(boot("current-control"),240452)
    save()
    try:
        LIB["shared"]["flash"](args,args.output,image,label)
        # Let the automatic boot settle before committing three observed software reboots.
        log=LIB["shared"]["capture"](args.port,args.output,"first-after-programming",16,["13 worlds"])
        LIB["worlds"](log)
        for i in range(1 if args.select else 3):
            result["boots"].append(observe(boot(f"measured-{i+1}"),size,digest))
            save()
        preview,=DAY.glob("PICOCALC-EDITOR-CAPACITY--*/scripts/03-check-large-preview-on-p4.py")
        verify,=DAY.glob("PICOCALC-COMPILER-THESIS--*/scripts/supervisor/p4-verify-preview.py")
        subprocess.run([sys.executable,"-B",preview,"--engine","native","--port",args.port,
                        "--output",args.output/"preview","--long-inline"],check=True)
        result["preview"]=json.loads((args.output/"preview/results.json").read_text())
        result["pixels"]=json.loads(subprocess.check_output([sys.executable,"-B",verify,args.output/"preview"]))
        save()
    finally:
        LIB["shared"]["flash"](args,args.output,backup,"restore")
        LIB["worlds"](LIB["shared"]["capture"](args.port,args.output,"restore-health",17,["14 worlds"]))
        result["restored"]=True
        save()
        result["control_after"]=observe(boot("restored-baseline"),240452)
        save()


if __name__=="__main__":
    main()
