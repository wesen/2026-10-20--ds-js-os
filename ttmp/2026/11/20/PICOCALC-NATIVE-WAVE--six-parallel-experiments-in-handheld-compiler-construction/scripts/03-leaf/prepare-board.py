"""Stage the release-lab search ABI and exact body images for the three-arm trial."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[6]
DAY = HERE.parents[2]
RELEASE = next(DAY.glob("PICOCALC-RELEASE-LAB--*"))
ARMS = ("stock", "leaf", "inline")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("work", type=Path)
    p.add_argument("reference", type=Path, help="release-lab generated main directory")
    a = p.parse_args()
    work = a.work.resolve()
    main_dir = work / "main"
    main_dir.mkdir(parents=True, exist_ok=True)
    units = ROOT / "picocalc-os/worlds/chess"
    source = "\n".join((units / (part + ".typed")).read_text() for part in ("state", "position", "moves", "search"))
    typed = work / "engine.typed"
    typed.write_text(source)
    subprocess.run(["node", HERE / "images.mjs", typed, main_dir, "engine"], check=True)
    host = json.loads((a.reference / "host.json").read_text())
    stock = json.loads((main_dir / "engine-stock.json").read_text())
    assert stock["sourceSha256"] == host["engineSourceSha256"]
    assert stock["rv32Sha256"] == host["rv32Sha256"]
    for f in ("bench-data.h", "host.json"):
        shutil.copyfile(a.reference / f, main_dir / f)
    for f in ("CMakeLists.txt", "sdkconfig.defaults"):
        shutil.copyfile(RELEASE / "scripts/chess/board" / f, work / f)
    shutil.copyfile(ROOT / "picocalc-os/port/esp32p4/partitions.csv", work / "partitions.csv")
    for f in ("CMakeLists.txt", "main.c"):
        shutil.copyfile(HERE / f, main_dir / f)
    asm = []
    for arm in ARMS:
        info = json.loads((main_dir / f"engine-{arm}.json").read_text())
        assert sha256((main_dir / f"engine-{arm}.bin").read_bytes()).hexdigest() == info["rv32Sha256"]
        asm.extend([f'.section .text.chess_{arm},"ax"', ".balign 4", f"{arm}_start:",
                    f'.incbin "engine-{arm}.bin"'])
        model_dir = work / arm / "main"
        model_dir.mkdir(parents=True, exist_ok=True)
        for f in ("bench-data.h", "host.json"):
            shutil.copyfile(a.reference / f, model_dir / f)
        shutil.copyfile(main_dir / f"engine-{arm}.bin", model_dir / "engine.bin")
        model_asm = ['.section .text.chess,"ax"', ".balign 4", "engine_start:", '.incbin "engine.bin"']
        for fn in ("chessStartSearch", "chessSearchSlice"):
            entry = info["entries"][fn]
            asm.extend([f".global {arm}_{fn}", f".set {arm}_{fn}, {arm}_start + {entry}"])
            model_asm.extend([f".global {fn}", f".set {fn}, engine_start + {entry}"])
        (model_dir / "engine.S").write_text("\n".join(model_asm) + "\n")
        model_host = dict(host, rv32Sha256=info["rv32Sha256"])
        (model_dir / "host.json").write_text(json.dumps(model_host,indent=2)+"\n")
    (main_dir / "engine.S").write_text("\n".join(asm) + "\n")


if __name__ == "__main__":
    main()
