"""Qualify the pinned research lowerer through the original twenty-four host replay entry points."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
DAY = HERE.parent.parent
REV = "dbe26be"
DIGEST = "532c5ed74ac6105b98c6a4609bae7f9c551f89e5a19ab36cd0e6faba91745e5b"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work",type=Path)
    parser.add_argument("gcc",type=Path)
    parser.add_argument("emulator",type=Path)
    p=parser.parse_args()
    work=p.work.resolve()
    work.mkdir(parents=True,exist_ok=True)
    checkout=work/"checkout"
    build=work/"staged"
    if not checkout.exists():
        subprocess.run(["git","clone","--quiet","--shared","--no-checkout",ROOT,checkout],check=True)
        subprocess.run(["git","-C",checkout,"checkout","--quiet","--detach",REV],check=True)
    recipe,=DAY.glob("PICOCALC-STAGED-RV32--*/scripts/01-stage.py")
    if not build.exists():
        subprocess.run(["python3","-B",recipe,build],check=True)
    for part in ("wasm","rv32","world"):
        src=build/"lanes/staged/typed"/(part+".js")
        if part=="rv32" and digest(src)!=DIGEST:
            raise ValueError("staged baseline has changed")
        shutil.copyfile(src,checkout/"picocalc-os/compiler"/("typed-"+part+".js"))
    # The ELF toolchain and already built host runtime do not contain the JavaScript
    # native lowerer. The replay scripts import the compiler under checkout directly.
    if not (checkout/"picocalc-os/build").exists():
        shutil.copytree(ROOT/"picocalc-os/build",checkout/"picocalc-os/build",symlinks=True)
    script,=DAY.glob("PICOCALC-NATIVE-NEXT--*/scripts/01-run-host-replays.sh")
    log=work/"baseline.log"
    with log.open("wb") as output:
        result=subprocess.run(["bash",script,p.gcc.resolve(),p.emulator.resolve()],cwd=checkout,stdout=output,stderr=subprocess.STDOUT)
    text=log.read_text(errors="replace")
    rows=[line for line in text.splitlines() if line.startswith(("PASS ","FAIL "))]
    receipt={"checkout":REV,"compiler":DIGEST,"replay_script_sha256":digest(script),"rows":rows,"exit":result.returncode}
    (work/"baseline.json").write_text(json.dumps(receipt,indent=2)+"\n")
    if result.returncode or len(rows)!=24 or any(not row.startswith("PASS ") for row in rows):
        raise RuntimeError(f"staged baseline replay failed, see {log}")
    print("24/24 staged replay checks passed")


if __name__=="__main__":
    main()
