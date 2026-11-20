"""Run the frontend study's frozen physical image and independently check firmware restoration."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys

HERE = Path(__file__).resolve().parent
lib=runpy.run_path(str(HERE/"04-board.py"))
front,=HERE.parent.parent.glob("PICOCALC-FRONTEND-COLD--*/scripts/07-board-receipt.py")
parse=runpy.run_path(str(front))["parse"]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work",type=Path)
    parser.add_argument("backup",type=Path)
    parser.add_argument("output",type=Path)
    parser.add_argument("--port",required=True)
    parser.add_argument("--esptool",type=Path,required=True)
    parser.add_argument("--image-sha",required=True)
    parser.add_argument("--backup-sha",required=True)
    parser.add_argument("--duration",type=int,default=98)
    a=parser.parse_args()
    a.esptool_python=a.esptool.parent/"python"
    image=a.work/"build/picocalc-os-p4.bin"
    backup=a.backup/"factory-original.bin"
    table=a.backup/"partition-table.bin"
    assert digest(image)==a.image_sha and backup.stat().st_size==0x800000 and digest(backup)==a.backup_sha
    assert (a.work/"build/partition_table/partition-table.bin").read_bytes().ljust(4096,b"\xff")==table.read_bytes()
    oracle=json.loads((a.work/"oracle.json").read_text())
    a.output.mkdir()
    logs=[]
    def capture(name,seconds,commands):
        return lib["shared"]["capture"](a.port,a.output,name,seconds,commands)
    try:
        lib["shared"]["flash"](a,a.output,image,"trial")
        for i in range(2):
            mark=f"boot-{i+1}"
            commands=["0.4 reboot"] if i else []
            query=str(a.duration-3)+" worlds"
            log=capture(mark,a.duration,commands+[query])
            if i==0 and "FRONT begin 0 0 base files" not in log:
                lib["worlds"](log)
                mark+="-complete"
                log=capture(mark,a.duration,["0.4 reboot",query])
            parse(log,oracle)
            logs.append(a.output/(mark+".log"))
        receipt=subprocess.check_output([sys.executable,"-B",front,a.work,a.work/"oracle.json",*logs])
        (a.output/"physical.json").write_bytes(receipt)
    finally:
        lib["shared"]["flash"](a,a.output,backup,"restore")
        restored=lib["worlds"](capture("restored",17,["14 worlds"]))
        (a.output/"restored.json").write_text(json.dumps({"factory_sha256":digest(backup),"worlds":restored},indent=2)+"\n")
if __name__=="__main__":
    main()
