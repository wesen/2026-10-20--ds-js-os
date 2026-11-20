#!/usr/bin/env python3
"""Run the professor's replays with a selected compiler in a disposable qualified checkout."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

DAY = Path(__file__).resolve().parents[2]


def replay(output, baseline, lane, gcc, emulator):
    proof = json.loads((baseline / "baseline.json").read_text())
    if proof["exit"] or len(proof["rows"]) != 24 or not all(x.startswith("PASS ") for x in proof["rows"]):
        raise ValueError("staged control replays must qualify first")
    output.mkdir(parents=True)
    checkout = output / "checkout"
    shutil.copytree(baseline / "checkout", checkout, symlinks=True)
    hashes = {}
    for part in ("wasm", "rv32", "world"):
        source = lane / "typed" / (part + ".js")
        hashes[part] = hashlib.sha256(source.read_bytes()).hexdigest()
        shutil.copyfile(source, checkout / "picocalc-os/compiler" / ("typed-" + part + ".js"))
    recipe, = DAY.glob("PICOCALC-NATIVE-NEXT--*/scripts/01-run-host-replays.sh")
    log = output / "replays.log"
    with log.open("wb") as stdout:
        result = subprocess.run(["bash", recipe, gcc, emulator], cwd=checkout, stdout=stdout,
                                stderr=subprocess.STDOUT, check=False)
    rows = [x for x in log.read_text().splitlines() if x.startswith(("PASS ", "FAIL "))]
    (output / "replays.json").write_text(json.dumps({"checkout": proof["checkout"],
        "lane": lane.name, "compiler": hashes, "rows": rows, "exit": result.returncode}, indent=2) + "\n")
    if result.returncode or len(rows) != 24 or not all(row.startswith("PASS ") for row in rows):
        raise RuntimeError(f"host replays failed, see {log}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ("output", "baseline", "lane", "gcc", "emulator"):
        parser.add_argument(field, type=Path)
    args = parser.parse_args()
    replay(*(getattr(args, field).resolve() for field in ("output", "baseline", "lane", "gcc", "emulator")))
