"""Run two balanced boots through the ordinary native wrappers, validate every ELF and restore."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys

here=Path(__file__).resolve().parent
day=here.parent.parent
legacy,=(day.parent/"18").glob("PICOCALC-TYPED-APPS--*/scripts/06-qualify-files-on-p4.py")
serial=runpy.run_path(str(legacy))
lanes=("base","branch","compact","both")
apps=("files","agenda","editor")
order=((0,1,3,2),(1,2,0,3),(2,3,1,0),(3,0,2,1))

def sha(data):
    return hashlib.sha256(data).hexdigest()

def worlds(log):
    for line in log.splitlines():
        if line.startswith('[{"name":'):
            entries={e["name"]:e for e in json.loads(line)}
            result={a:{k:entries[a][k] for k in ("engine","file","last_error")} for a in apps}
            for a,v in result.items():
                assert v["engine"]=="native" and v["file"]==a+"/compiled.bin" and not v["last_error"]
            return result
    raise ValueError("native world status missing")

def parse(log,oracle):
    expected=[(b,p,lanes[l],app) for b,row in enumerate(order) for p,l in enumerate(row) for app in apps]
    selected=None
    measure=None
    streamed=False
    rows=[]
    for line in log.splitlines():
        if line.startswith("JOINT begin "):
            assert selected is None and len(rows)<48
            _,_,b,p,lane,app=line.split()
            selected=(int(b),int(p),lane,app)
            assert selected==expected[len(rows)]
            measure=None
            streamed=False
        elif selected:
            b,p,lane,app=selected
            if line==app+" native compiler functions=streamed":
                streamed=True
            elif line.startswith(app+" compile source="):
                m=re.fullmatch(r"\w+ compile source=bundle status=ok us=(\d+) peak_js_bytes=(\d+) module_bytes=(\d+)",line)
                assert m and measure is None,line
                measure=list(map(int,m.groups()))
            elif line.startswith("JOINT end "):
                _,_,who,what,digest=line.split()
                assert (who,what)==(lane,app) and streamed and measure
                want=oracle["outputs"][app][lane]
                us,peak,size=measure
                assert us>0 and peak>0 and (size,digest)==(want["bytes"],want["sha256"])
                rows.append(dict(block=b,position=p,lane=lane,app=app,us=us,peak=peak,bytes=size,sha256=digest))
                selected=None
    assert selected is None and len(rows)==48 and "JOINT complete" in log.splitlines()
    assert "JOINT failed" not in log
    return {"rows":rows,"native_worlds":worlds(log)}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work",type=Path)
    parser.add_argument("port")
    parser.add_argument("esptool",type=Path)
    args=parser.parse_args()
    work=args.work.resolve()
    args.esptool_python=args.esptool.parent/"python"
    app=work/"build/picocalc-os-p4.bin"
    original=work/"original/factory-original.bin"
    table=(work/"original/partition-table.bin").read_bytes()
    assert (work/"build/partition_table/partition-table.bin").read_bytes().ljust(4096,b"\xff")==table
    assert original.stat().st_size==8*1024**2 and 0<app.stat().st_size<original.stat().st_size
    image=app.read_bytes()
    compilers=json.loads((work/"compilers.json").read_text())
    for lane in lanes:
        js=(work/"lanes"/lane/"typed/rv32.js").read_bytes()
        assert sha(js)==compilers[lane] and js in image
    oracle=json.loads(subprocess.check_output(["node",here/"05-oracle.mjs",work],text=True))
    receipt=dict(compiler_sha256=compilers,firmware_sha256=sha(image),saved_sha256=sha(original.read_bytes()),
                 partition_table_sha256=sha(table),oracle=oracle,boots=[])
    def save():
        (work/"physical.json").write_text(json.dumps(receipt,indent=2)+"\n")
    def capture(name,duration,commands):
        return serial["capture"](args.port,work,name,duration,commands)
    save()
    try:
        serial["flash"](args,work,app,"trial")
        for boot in range(2):
            commands=["87 worlds"] if boot==0 else ["0.4 reboot","87 worlds"]
            log=capture("boot-"+str(boot+1),90,commands)
            if boot==0 and "JOINT begin 0 0 base files" not in log:
                worlds(log)
                log=capture("boot-1-recapture",90,["0.4 reboot","87 worlds"])
            receipt["boots"].append(parse(log,oracle))
            save()
        checker,=day.glob("PICOCALC-EDITOR-CAPACITY--*/scripts/03-check-large-preview-on-p4.py")
        subprocess.run([sys.executable,"-B",checker,"--engine","native","--port",args.port,"--output",work/"preview","--long-inline"],check=True)
        compare,=day.glob("PICOCALC-COMPILER-THESIS--*/scripts/supervisor/p4-verify-preview.py")
        receipt["preview"]=json.loads(subprocess.check_output([sys.executable,compare,work/"preview"]))
        receipt["workflow"]=json.loads((work/"preview/results.json").read_text())
        save()
    finally:
        serial["flash"](args,work,original,"restore")
        receipt["restored_worlds"]=worlds(capture("restored",17,["14 worlds"]))
        receipt["original_restored"]=True
        save()

if __name__=="__main__":
    main()
