#!/usr/bin/env python3
"""Apply A6 to the frozen staged frontend and produce runnable compiler lanes."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
PARTS = ("wasm", "rv32", "world")


def stage(output, staged):
    output.mkdir(parents=True)
    if staged is None:
        recipe, = DAY.glob("PICOCALC-STAGED-RV32--*/scripts/01-stage.py")
        staged = output / "frozen"
        subprocess.run(["python3", "-B", recipe, staged], check=True)
    control = output / "lanes/staged"
    candidate = output / "lanes/conditions"
    shutil.copytree(staged / "lanes/staged", control)
    shutil.copytree(control, candidate)
    subprocess.run(["patch", "--batch", "--fuzz=0", "-p1", "-i",
                    HERE / "02-condition-destinations.patch"], cwd=candidate, check=True)
    shutil.copytree(staged / "sources", output / "sources")
    hashes = {
        lane.name: {part: hashlib.sha256((lane / "typed" / f"{part}.js").read_bytes()).hexdigest()
                    for part in PARTS}
        for lane in (control, candidate)
    }
    (output / "compilers.json").write_text(json.dumps(hashes, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--staged", type=Path, help="optional existing frozen tree")
    args = parser.parse_args()
    stage(args.output.resolve(), args.staged.resolve() if args.staged else None)
