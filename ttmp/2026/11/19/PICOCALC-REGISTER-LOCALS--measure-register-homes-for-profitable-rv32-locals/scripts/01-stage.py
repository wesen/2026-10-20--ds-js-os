#!/usr/bin/env python3
"""Stage A6 and its two A7 register policies, plus a host-only frame counter."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
DAY = HERE.parent.parent
PARTS = ("wasm", "rv32", "world")
A6 = {
    "wasm": "eaafeda68a206aa27b86a54e510ca65ed3e3c50763d23004e169fe9a329eb960",
    "rv32": "532c5ed74ac6105b98c6a4609bae7f9c551f89e5a19ab36cd0e6faba91745e5b",
    "world": "e655f8250baef1d8247995d8e7c82ace6e9131fad6254e1c7c374b31efa309a3",
}


def fingerprints(lane):
    return {part: hashlib.sha256((lane / "typed" / f"{part}.js").read_bytes()).hexdigest()
            for part in PARTS}


def stage(output, a6):
    output.mkdir(parents=True)
    if a6 is None:
        recipe, = DAY.glob("PICOCALC-CONDITION-TARGETS--*/scripts/01-stage.py")
        a6 = output / "condition-stage"
        subprocess.run(["python3", "-B", recipe, a6], check=True)
    control = a6 / "lanes/conditions"
    if fingerprints(control) != A6:
        raise ValueError("the selected A6 compiler identity differs from the pinned A7 control")
    lanes = output / "lanes"
    shutil.copytree(control, lanes / "a6")
    for policy in ("uses", "loops", "frame"):
        candidate = lanes / policy
        shutil.copytree(control, candidate)
        subprocess.run(["patch", "--batch", "--fuzz=0", "-p1", "-i",
                        HERE / "02-register-locals.patch"], cwd=candidate, check=True)
        backend = candidate / "typed/rv32.js"
        text = backend.read_text()
        marker = 'const REGISTER_LOCALS = "uses";'
        assert text.count(marker) == 1
        backend.write_text(text.replace(marker, f'const REGISTER_LOCALS = "{policy}";'))
    shutil.copytree(a6 / "sources", output / "sources")
    hashes = {policy: fingerprints(lanes / policy) for policy in ("a6", "uses", "loops", "frame")}
    (output / "compilers.json").write_text(json.dumps(hashes, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--a6", type=Path, help="optional existing A6 staged tree")
    args = parser.parse_args()
    stage(args.output.resolve(), args.a6.resolve() if args.a6 else None)
