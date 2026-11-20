#!/usr/bin/env python3
"""Run the normal Editor and cross-target replay suite with typed await enabled."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

DAY = Path(__file__).resolve().parents[2]


def replay(output, baseline, lane, gcc, emulator):
    proof = json.loads((baseline / "baseline.json").read_text())
    if proof["exit"] or len(proof["rows"]) != 24:
        raise ValueError("the staged control must qualify before the candidate")
    output.mkdir(parents=True)
    checkout = output / "checkout"
    shutil.copytree(baseline / "checkout", checkout, symlinks=True)
    compiler = checkout / "picocalc-os/compiler"
    for part in ("wasm", "rv32"):
        shutil.copyfile(lane / "typed" / (part + ".js"), compiler / ("typed-" + part + ".js"))
    # The replay scripts use the normal static JS imports. The P4 instead
    # evaluates the same await source as a separate compiler bundle entry.
    typed = lane / "typed"
    (compiler / "typed-world.js").write_bytes((typed / "async.js").read_bytes() + (typed / "world.js").read_bytes())
    shutil.copyfile(lane / "editor.typed", checkout / "picocalc-os/worlds/editor/editor.typed")
    replays, = DAY.glob("PICOCALC-NATIVE-NEXT--*/scripts/01-run-host-replays.sh")
    log = output / "replays.log"
    with log.open("wb") as stream:
        result = subprocess.run(["bash", replays, gcc, emulator], cwd=checkout,
                                stdout=stream, stderr=subprocess.STDOUT, check=False)
    rows = [line for line in log.read_text().splitlines() if line.startswith(("PASS ", "FAIL "))]
    (output / "replays.json").write_text(json.dumps({
        "source": json.loads((lane.parents[1] / "inputs.json").read_text())["lanes"][lane.name],
        "checkout": proof["checkout"], "lane": lane.name, "rows": rows, "exit": result.returncode}, indent=2) + "\n")
    if result.returncode or len(rows) != 24 or not all(row.startswith("PASS ") for row in rows):
        raise RuntimeError(f"check the replay failure in {log}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    keys = ("output", "baseline", "lane", "gcc", "emulator")
    for key in keys:
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    replay(*(getattr(args, key).resolve() for key in keys))
