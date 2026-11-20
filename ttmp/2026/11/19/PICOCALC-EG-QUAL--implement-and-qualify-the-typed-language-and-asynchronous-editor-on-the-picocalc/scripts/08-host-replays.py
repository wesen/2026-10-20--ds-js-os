"""Run the existing 24 application workflows from an isolated, named implementation revision."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[5]
REPLAY,=(HERE.parent.parent).glob("PICOCALC-NATIVE-NEXT--*/scripts/01-run-host-replays.sh")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("out",type=Path);p.add_argument("revision");p.add_argument("gcc",type=Path);p.add_argument("emulator",type=Path)
    a=p.parse_args()
    out=a.out.resolve();out.mkdir(parents=True,exist_ok=False)
    rev=subprocess.check_output(["git","-C",REPO,"rev-parse",a.revision],text=True).strip()
    tree=out/"checkout"
    subprocess.run(["git","clone","--quiet","--local","--no-checkout",REPO,tree],check=True)
    subprocess.run(["git","-C",tree,"checkout","--quiet","--detach",rev],check=True)
    shutil.copytree(REPO/"picocalc-os/build",tree/"picocalc-os/build",symlinks=True)
    log=out/"host.log"
    with log.open("wb") as f:
        proc=subprocess.run(["bash",REPLAY,a.gcc.resolve(),a.emulator.resolve()],cwd=tree,stdout=f,stderr=subprocess.STDOUT)
    rows=[line for line in log.read_text(errors="replace").splitlines() if line.startswith(("PASS ","FAIL "))]
    receipt=dict(revision=rev,script_sha256=hashlib.sha256(REPLAY.read_bytes()).hexdigest(),exit=proc.returncode,rows=rows)
    (out/"replays.json").write_text(json.dumps(receipt,indent=2)+"\n")
    if proc.returncode or len(rows)!=24 or any(r.startswith("FAIL ") for r in rows):
        raise RuntimeError(f"host replay failure: {log}")
    print(f"24/24 host workflows passed at {rev}")


if __name__=="__main__":main()
